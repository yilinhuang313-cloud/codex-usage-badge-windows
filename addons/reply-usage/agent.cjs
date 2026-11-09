'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {UsageStore}=require('./usage-reader.cjs');
const {bootstrap}=require('./renderer.cjs');
function isSupportedTarget(target){
 try{const u=new URL(target?.url);return target.type==='page'&&u.protocol==='app:'&&u.hostname==='-'&&['/index.html','/detached-window.html'].includes(u.pathname)&&!/overlay/i.test(decodeURIComponent(u.search+u.hash));}catch{return false;}
}
function isLoopbackSocket(value,port){
 try{const u=new URL(value);return u.protocol==='ws:'&&['127.0.0.1','localhost','[::1]'].includes(u.hostname)&&Number(u.port)===port&&!u.username&&!u.password;}catch{return false;}
}
class CdpSession{
 constructor(target,port=39222){this.target=target;this.port=port;this.pending=new Map();this.serial=0;this.socket=null;}
 async connect(){
  if(!isLoopbackSocket(this.target.webSocketDebuggerUrl,this.port))throw Error('Invalid local CDP endpoint');
  const ws=new WebSocket(this.target.webSocketDebuggerUrl);this.socket=ws;
  ws.addEventListener('message',e=>{
   let m;try{m=JSON.parse(e.data);}catch{return;}
   const request=this.pending.get(m.id);if(!request)return;this.pending.delete(m.id);clearTimeout(request.timer);
   if(m.error||m.result?.exceptionDetails)request.reject(Error('Renderer request failed'));else request.resolve(m.result);
  });
  ws.addEventListener('close',()=>this.rejectPending());ws.addEventListener('error',()=>this.rejectPending());
  await new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>{ws.close();reject(Error('Local connection timed out'));},4000);
   ws.addEventListener('open',()=>{clearTimeout(timer);resolve();},{once:true});
   ws.addEventListener('error',()=>{clearTimeout(timer);reject(Error('Local connection unavailable'));},{once:true});
   ws.addEventListener('close',()=>{clearTimeout(timer);reject(Error('Local connection closed'));},{once:true});
  });
 }
 request(method,params={}){
  if(this.socket?.readyState!==WebSocket.OPEN)return Promise.reject(Error('Local connection closed'));
  const id=++this.serial;
  return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{this.pending.delete(id);reject(Error('Local request timed out'));},10000);this.pending.set(id,{resolve,reject,timer});
   try{this.socket.send(JSON.stringify({id,method,params}));}catch(e){clearTimeout(timer);this.pending.delete(id);reject(e);}
  });
 }
 async evaluate(expression){const r=await this.request('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});return r?.result?.value;}
 rejectPending(){for(const r of this.pending.values()){clearTimeout(r.timer);r.reject(Error('Local connection closed'));}this.pending.clear();}
 close(){this.rejectPending();this.socket?.close();this.socket=null;}
}
function writeState(root,value){
 fs.mkdirSync(root,{recursive:true});const temp=path.join(root,'reply-usage-state.json.tmp');fs.writeFileSync(temp,JSON.stringify(value,null,2)+'\n');fs.renameSync(temp,path.join(root,'reply-usage-state.json'));
}
async function main(args=process.argv.slice(2)){
 const index=args.indexOf('--root'),root=index>=0?path.resolve(args[index+1]):__dirname;
 const configIndex=args.indexOf('--config'),configPath=configIndex>=0?path.resolve(args[configIndex+1]):path.join(process.env.LOCALAPPDATA||path.join(os.homedir(),'AppData','Local'),'CodexUsageBadge','config.json');
 const config=JSON.parse(fs.readFileSync(configPath,'utf8'));
 const port=Number(config.Port||39222);if(!Number.isInteger(port)||port<1024||port>65535)throw Error('Invalid local port');
 const home=config.CodexHome||process.env.CODEX_HOME||path.join(os.homedir(),'.codex');
 const store=new UsageStore(path.join(home,'sessions')),sessions=new Map();
 let stopped=false,timer;const once=args.includes('--once');
 const stopFile=path.join(root,'reply-usage.stop');
 async function scan(){
  const pages=await(await fetch(`http://127.0.0.1:${port}/json/list`,{signal:AbortSignal.timeout(3000)})).json();
  const targets=pages.filter(isSupportedTarget),live=new Set(targets.map(t=>t.id));
  for(const[id,s]of sessions)if(!live.has(id)){s.close();sessions.delete(id);}
  for(const target of targets){
   let session=sessions.get(target.id);
   try{if(!session){session=new CdpSession(target,port);await session.connect();sessions.set(target.id,session);}await session.evaluate(bootstrap());}
   catch{session?.close();sessions.delete(target.id);}
  }
 }
 async function tick(){
  if(stopped)return;
  if(fs.existsSync(stopFile)){await shutdown();return;}
  let state={version:'1.1.0',pid:process.pid,state:'waiting',checkedAt:Date.now(),windows:0,badges:0,ready:0};
  try{
   await scan();const requests=[];
   for(const session of sessions.values()){
    try{const ids=await session.evaluate('window.__codexReplyUsage?.requestedIds()??[]');requests.push({session,ids:Array.isArray(ids)?ids:[]});}catch{}
   }
   if(requests.length){
    const snapshot=store.read(requests.flatMap(r=>r.ids));
    for(const {session,ids}of requests){
     try{const turns=Object.fromEntries(ids.filter(id=>Object.hasOwn(snapshot.turns,id)).map(id=>[id,snapshot.turns[id]]));await session.evaluate(`window.__codexReplyUsage?.update(${JSON.stringify({...snapshot,turns})})`);
      const status=await session.evaluate('window.__codexReplyUsage?.status()');state.badges+=status?.badges||0;state.ready+=status?.ready||0;
     }catch{}
    }
    state.state=snapshot.ok?'running':'partial';state.windows=requests.length;
   }
  }catch{for(const s of sessions.values())s.close();sessions.clear();}
  writeState(root,state);
  if(once){for(const s of sessions.values())s.close();console.log(JSON.stringify(state));return;}
  if(!stopped)timer=setTimeout(tick,2000);
 }
 async function shutdown(){
  if(stopped)return;stopped=true;clearTimeout(timer);
  for(const session of sessions.values()){try{await session.evaluate('window.__codexReplyUsage?.dispose()');}catch{}session.close();}sessions.clear();
  writeState(root,{version:'1.1.0',pid:process.pid,state:'stopped',checkedAt:Date.now()});
 }
 process.once('SIGINT',()=>shutdown());process.once('SIGTERM',()=>shutdown());await tick();
}
module.exports={isSupportedTarget,isLoopbackSocket,CdpSession,main};
if(require.main===module)main().catch(()=>{console.error('Reply usage addon could not start. Check local installation and runtime.');process.exitCode=1;});
