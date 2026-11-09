'use strict';
const fs=require('node:fs'),path=require('node:path');
const {StringDecoder}=require('node:string_decoder');
const UUID=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const FIELDS=['input_tokens','cached_input_tokens','cache_write_input_tokens','output_tokens','reasoning_output_tokens','total_tokens'];
function replyIdentity(value){
 if(typeof value!=='string')return null;
 const id=value.replace(/^history-content:turn:/,'').split(':')[0];
 return UUID.test(id)?id.toLowerCase():null;
}
function tokenVector(value){
 if(!value||!Number.isSafeInteger(value.total_tokens)||value.total_tokens<0)return null;
 const result={};
 for(const field of FIELDS){const n=value[field]??0;if(!Number.isSafeInteger(n)||n<0)return null;result[field]=n;}
 return result;
}
function quotaSnapshot(value){
 if(!value||typeof value!=='object'||(value.limit_id&&value.limit_id!=='codex'))return null;
 const result={};
 for(const name of ['primary','secondary']){
  const w=value[name];
  result[name]=w&&Number.isFinite(w.used_percent)&&w.used_percent>=0&&w.used_percent<=100&&Number.isFinite(w.window_minutes)&&Number.isFinite(w.resets_at)?{used:w.used_percent,minutes:w.window_minutes,resetsAt:w.resets_at}:null;
 }
 return result.primary||result.secondary?result:null;
}
function quotaChange(before,after){
 const result={};for(const name of ['primary','secondary']){
  const a=before?.[name],b=after?.[name];
  result[name]=a&&b&&a.resetsAt===b.resetsAt&&a.minutes===b.minutes&&b.used>=a.used?{percentagePoints:Math.round((b.used-a.used)*1000)/1000,windowMinutes:b.minutes}:null;
 }return result;
}
class UsageTimeline{
 constructor(){this.turns=new Map();this.current=null;this.previous=null;this.lastQuota=null;}
 activate(id){
  if(!UUID.test(id??''))return null;id=id.toLowerCase();
  if(this.current?.id===id)return this.current;
  if(this.current&&this.current.status==='running')this.current.status='interrupted';
  let turn=this.turns.get(id);
  if(!turn){turn={id,status:'running',usage:null,partial:false,model:null,quotaBefore:this.lastQuota,quotaAfter:null};this.turns.set(id,turn);}
  this.current=turn;return turn;
 }
 ingest(record){
  const p=record?.payload;if(!p||typeof p!=='object')return;
  if(record.type==='turn_context'){
   const t=this.activate(p.turn_id);if(t&&typeof p.model==='string')t.model=p.model.slice(0,100);return;
  }
  if(record.type!=='event_msg')return;
  if(p.type==='task_started'||p.type==='turn_started'){this.activate(p.turn_id??p.turn_attribution?.turn_id);return;}
  if(p.type==='task_complete'||p.type==='turn_complete'||p.type==='turn_aborted'){
   const id=replyIdentity(p.turn_id??this.current?.id),t=this.turns.get(id);
   if(t){t.status=p.type==='turn_aborted'?'interrupted':'complete';if(Number.isFinite(p.duration_ms))t.durationMs=p.duration_ms;}
   if(this.current?.id===id)this.current=null;return;
  }
  if(p.type!=='token_count')return;
  const nextQuota=quotaSnapshot(p.rate_limits);if(nextQuota)this.lastQuota=nextQuota;
  const total=tokenVector(p.info?.total_token_usage),last=tokenVector(p.info?.last_token_usage);
  const t=this.current;
  if(t&&nextQuota)t.quotaAfter=nextQuota;
  if(!total)return;
  // Codex fill_to_context_window emits a synthetic marker, not response spend.
  if(p.info?.last_usage_includes_reasoning==null&&total.total_tokens>0&&total.total_tokens===p.info?.model_context_window&&FIELDS.filter(k=>k!=='total_tokens').every(k=>total[k]===0)&&last&&FIELDS.filter(k=>k!=='total_tokens').every(k=>last[k]===0)){
   this.previous=total;if(t)t.partial=true;return;
  }
  let delta=null;
  if(this.previous){
   if(total.total_tokens>=this.previous.total_tokens&&total.input_tokens>=this.previous.input_tokens&&total.output_tokens>=this.previous.output_tokens){
    delta=Object.fromEntries(FIELDS.map(k=>[k,Math.max(0,total[k]-this.previous[k])]));
    if(t&&FIELDS.some(k=>total[k]<this.previous[k]))t.partial=true;
   }else{delta=last;if(t)t.partial=true;}
  }else{
   delta=last;
   if(t&&(!last||FIELDS.some(k=>total[k]!==last[k])))t.partial=true;
  }
  this.previous=total;
  if(!t||!delta)return;
  if(!t.usage)t.usage=Object.fromEntries(FIELDS.map(k=>[k,0]));
  for(const k of FIELDS){const sum=t.usage[k]+delta[k];if(!Number.isSafeInteger(sum)){t.partial=true;return;}t.usage[k]=sum;}
 }
 get(id){
  const t=this.turns.get(id);if(!t)return null;
  const {quotaBefore,quotaAfter,...view}=t;
  return {...view,usage:t.usage?{...t.usage}:null,quota:quotaChange(quotaBefore,quotaAfter)};
 }
}
class RolloutReader{
 constructor(){this.files=new Map();}
 read(file){
  const stat=fs.statSync(file);let entry=this.files.get(file);
  if(!entry||stat.size<entry.offset||stat.ino!==entry.ino||(stat.size===entry.offset&&stat.mtimeMs!==entry.mtime)){
   entry={timeline:new UsageTimeline(),offset:0,pending:'',decoder:new StringDecoder('utf8'),ino:stat.ino,mtime:stat.mtimeMs};this.files.set(file,entry);
  }
  if(stat.size===entry.offset)return entry.timeline;
  const fd=fs.openSync(file,'r');
  try{
   const buffer=Buffer.alloc(256*1024);let budget=32*1024*1024;
   while(entry.offset<stat.size&&budget>0){
    const count=fs.readSync(fd,buffer,0,Math.min(buffer.length,stat.size-entry.offset,budget),entry.offset);if(!count)break;
    entry.offset+=count;budget-=count;entry.pending+=entry.decoder.write(buffer.subarray(0,count));
    let end;while((end=entry.pending.indexOf('\n'))!==-1){const line=entry.pending.slice(0,end);entry.pending=entry.pending.slice(end+1);try{entry.timeline.ingest(JSON.parse(line));}catch{}}
    if(entry.pending.length>32*1024*1024)throw Error('Rollout line exceeds safety bound');
   }
   entry.mtime=stat.mtimeMs;
  }finally{fs.closeSync(fd);}
  return entry.timeline;
 }
}
class UsageStore{
 constructor(root){this.root=root;this.reader=new RolloutReader();this.paths=[];this.discoveredAt=0;}
 discover(){
  const files=[],dirs=[this.root];let visited=0;
  while(dirs.length&&files.length<10000&&visited++<20000){
   const dir=dirs.pop();let entries;try{entries=fs.readdirSync(dir,{withFileTypes:true});}catch{continue;}
   for(const e of entries){if(e.isSymbolicLink())continue;const file=path.join(dir,e.name);if(e.isDirectory())dirs.push(file);else if(e.isFile()&&/^rollout-.*\.jsonl$/.test(e.name))files.push(file);}
  }
  this.paths=files;this.discoveredAt=Date.now();
  const live=new Set(files);for(const file of this.reader.files.keys())if(!live.has(file))this.reader.files.delete(file);
 }
 read(ids){
  if(Date.now()-this.discoveredAt>15000)this.discover();
  const wanted=new Set(ids.map(replyIdentity).filter(Boolean).slice(0,500));
  const turns={},sources=new Map();let errors=0;
  for(const file of this.paths){
   try{const timeline=this.reader.read(file);for(const id of wanted){const value=timeline.get(id);if(!value)continue;
    if(sources.has(id)&&sources.get(id)!==file){turns[id]={id,ambiguous:true,usage:null,status:'unavailable'};}else{sources.set(id,file);turns[id]=value;}
   }}catch{errors++;}
  }
  return {ok:errors===0,turns,checkedAt:Date.now()};
 }
}
module.exports={UsageTimeline,RolloutReader,UsageStore,replyIdentity,quotaChange};
