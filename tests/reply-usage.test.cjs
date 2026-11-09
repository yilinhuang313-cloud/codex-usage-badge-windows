const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {UsageTimeline,RolloutReader,UsageStore,replyIdentity}=require('../addons/reply-usage/usage-reader.cjs');
const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222';
const event=(type,fields={})=>({type:'event_msg',payload:{type,...fields}});
const start=id=>event('task_started',{turn_id:id,root_turn_id:id});
const done=id=>event('task_complete',{turn_id:id});
const tokens=(input,output,cached=0,reasoning=0)=>({input_tokens:input,output_tokens:output,cached_input_tokens:cached,reasoning_output_tokens:reasoning,total_tokens:input+output});
const quota=(used,reset=12345)=>({primary:{used_percent:used,window_minutes:300,resets_at:reset}});
const usage=(total,last=total,rate_limits=null)=>event('token_count',{info:{total_token_usage:total,last_token_usage:last,last_usage_includes_reasoning:true},rate_limits});

test('aggregates multiple model requests, ignores duplicate cumulative events, and keeps turns separate',()=>{
 const t=new UsageTimeline();t.ingest(start(A));
 t.ingest(usage(tokens(100,20,80,5)));t.ingest(usage(tokens(100,20,80,5)));
 t.ingest(usage(tokens(250,50,200,15),tokens(150,30,120,10)));t.ingest(done(A));
 t.ingest(start(B));t.ingest(usage(tokens(300,60,240,17),tokens(50,10,40,2)));t.ingest(done(B));
 assert.equal(t.get(A).usage.total_tokens,300);assert.equal(t.get(A).usage.cached_input_tokens,200);
 assert.equal(t.get(A).usage.reasoning_output_tokens,15);assert.equal(t.get(A).status,'complete');
 assert.equal(t.get(B).usage.total_tokens,60);assert.equal(t.get(B).usage.input_tokens,50);
});
test('same turn_context does not reset usage; final answer content is not retained',()=>{
 const t=new UsageTimeline();t.ingest(start(A));t.ingest(usage(tokens(30,10)));
 t.ingest({type:'turn_context',payload:{turn_id:A,model:'test-model'}});
 t.ingest({type:'response_item',payload:{role:'assistant',id:'msg_x',phase:'final_answer',content:[{type:'output_text',text:'PRIVATE TEST TEXT'}]}});
 t.ingest(done(A));assert.equal(t.get(A).usage.total_tokens,40);assert.equal(t.get(A).model,'test-model');
 assert.equal(JSON.stringify(t.get(A)).includes('PRIVATE TEST TEXT'),false);
});
test('initial imported cumulative total uses last request only and explicitly marks incomplete baseline',()=>{
 const t=new UsageTimeline();t.ingest(start(A));t.ingest(usage(tokens(1000,200),tokens(100,20)));
 assert.equal(t.get(A).usage.total_tokens,120);assert.equal(t.get(A).partial,true);
});
test('counter reset remains partial, never invents a negative delta',()=>{
 const t=new UsageTimeline();t.ingest(start(A));t.ingest(usage(tokens(100,20)));
 t.ingest(usage(tokens(10,5),tokens(10,5)));
 assert.equal(t.get(A).partial,true);assert.equal(t.get(A).usage.total_tokens,135);
});
test('context-full synthetic accounting is excluded and later real counters are safely rebased',()=>{
 const t=new UsageTimeline();t.ingest(start(A));t.ingest(usage(tokens(100,20)));
 t.ingest(event('token_count',{info:{model_context_window:200000,last_usage_includes_reasoning:null,total_token_usage:{total_tokens:200000},last_token_usage:{total_tokens:199880}}}));
 assert.equal(t.get(A).usage.total_tokens,120);
 t.ingest(usage({...tokens(10,5),total_tokens:200015},tokens(10,5)));
 assert.equal(t.get(A).usage.total_tokens,135);assert.equal(t.get(A).partial,true);
});
test('unattributed usage after completion does not charge a previous reply',()=>{
 const t=new UsageTimeline();t.ingest(start(A));t.ingest(usage(tokens(100,20)));t.ingest(done(A));
 t.ingest(usage(tokens(200,40),tokens(100,20)));
 assert.equal(t.get(A).usage.total_tokens,120);
 t.ingest(start(B));t.ingest(usage(tokens(210,45),tokens(10,5)));assert.equal(t.get(B).usage.total_tokens,15);
});
test('missing usage stays null rather than fabricated zero',()=>{
 const t=new UsageTimeline();t.ingest(start(A));t.ingest(done(A));assert.equal(t.get(A).usage,null);
});
test('quota uses a prior snapshot, labels same-window change and rejects reset',()=>{
 const t=new UsageTimeline();t.ingest(usage(tokens(0,0),tokens(0,0),quota(10)));
 t.ingest(start(A));t.ingest(usage(tokens(10,2),tokens(10,2),quota(12)));t.ingest(done(A));
 assert.equal(t.get(A).quota.primary.percentagePoints,2);
 t.ingest(start(B));t.ingest(usage(tokens(20,4),tokens(10,2),quota(1,99999)));t.ingest(done(B));
 assert.equal(t.get(B).quota.primary,null);
});
test('partial JSONL tail, append, truncation and invalid records are safely handled',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'reply-usage-test-'));const file=path.join(dir,'rollout.jsonl');
 try{
  const r=new RolloutReader();const a=JSON.stringify(start(A)),u=JSON.stringify(usage(tokens(50,5)));
  fs.writeFileSync(file,a+'\n'+u.slice(0,30));assert.equal(r.read(file).get(A).usage,null);
  fs.appendFileSync(file,u.slice(30)+'\nINVALID\n'+JSON.stringify(done(A))+'\n');
  assert.equal(r.read(file).get(A).usage.total_tokens,55);assert.equal(r.read(file).get(A).usage.total_tokens,55);
  fs.writeFileSync(file,JSON.stringify(start(B))+'\n');assert.equal(r.read(file).get(A),null);assert.equal(r.read(file).get(B).usage,null);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('stable turn identity is required; message ids or visual positions cannot become turn ids',()=>{
 assert.equal(replyIdentity(A+':msg_123'),A);assert.equal(replyIdentity('history-content:turn:'+B),B);
 for(const x of ['msg_123','0','',null,'javascript:alert(1)'])assert.equal(replyIdentity(x),null);
});
test('conflicting timelines reject ambiguous turn identity',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'reply-usage-test-'));
 try{
  for(let i=0;i<2;i++)fs.writeFileSync(path.join(dir,'rollout-'+i+'.jsonl'),[start(A),usage(tokens(10+i,2))].map(JSON.stringify).join('\n')+'\n');
  const s=new UsageStore(dir);assert.equal(s.read([A]).turns[A].ambiguous,true);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
