// Opt-in integration check. Requires the user's existing local CDP-enabled Codex.
const {CdpSession,isSupportedTarget}=require('../addons/reply-usage/agent.cjs');
const {installReplyUsage,formatUsageLabel,detailLines}=require('../addons/reply-usage/renderer.cjs');
(async()=>{
 const pages=await(await fetch('http://127.0.0.1:39222/json/list')).json();const page=pages.find(t=>isSupportedTarget(t)&&new URL(t.url).pathname==='/index.html');
 if(!page)throw Error('A locally connected Codex window is required');
 const session=new CdpSession(page);await session.connect();
 try{
  const result=await session.evaluate(`(()=>{
   const frame=document.createElement('iframe');frame.style.display='none';document.body.append(frame);
   const w=frame.contentWindow,d=w.document,checks=[];
   const check=(ok,name)=>{if(!ok)throw Error(name);checks.push(name);};
   w.__codexReplyUsageLabel=${formatUsageLabel.toString()};w.__codexReplyUsageDetails=${detailLines.toString()};
   const install=${installReplyUsage.toString()};
   const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222';
   try{
    const turn=d.createElement('div');turn.setAttribute('data-content-search-turn-key',A);
    const host=d.createElement('div');host.setAttribute('data-local-conversation-final-assistant','true');
    const bar=d.createElement('div');bar.className='turn-action-controls';host.append(bar);turn.append(host);d.body.append(turn);
    const unrelated=d.createElement('div');unrelated.className='turn-action-controls';d.body.append(unrelated);
    install(w);check(d.querySelectorAll('.codex-reply-usage').length===1,'Only final assistant bar receives badge');
    check(d.querySelector('.codex-reply-usage').textContent.includes('暂无数据'),'Missing record is explicit');
    const usage=n=>({input_tokens:n-10,output_tokens:10,total_tokens:n,cached_input_tokens:0,reasoning_output_tokens:0});
    w.__codexReplyUsage.update({turns:{[A]:{status:'complete',usage:usage(120),model:'<img src=x onerror=alert(1)>'},[B]:{status:'complete',usage:usage(550)}},checkedAt:Date.now()});
    check(d.querySelector('.codex-reply-usage').textContent.includes('120 Token'),'Exact turn usage displayed');
    install(w);check(d.querySelectorAll('.codex-reply-usage').length===1,'Repeated injection is idempotent');
    d.querySelector('.codex-reply-usage').click();check(!d.querySelector('[role=dialog]').hidden,'Click opens details');
    check(d.querySelector('[role=dialog]').textContent.includes('120'),'Details use matching turn');
    check(!d.querySelector('[role=dialog] img'),'Model names cannot inject HTML');
    d.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));check(d.querySelector('[role=dialog]').hidden,'Escape closes details');
    turn.setAttribute('data-content-search-turn-key',B);w.__codexReplyUsage.refresh();
    check(d.querySelector('.codex-reply-usage').textContent.includes('550 Token'),'Reused DOM does not retain old turn usage');
    w.__codexReplyUsage.dispose();check(!d.querySelector('.codex-reply-usage')&&!d.querySelector('[role=dialog]'),'Disposal removes addon nodes');
    return {passed:checks.length,checks};
   }finally{w.__codexReplyUsage?.dispose();frame.remove();}
  })()`);
  console.log(JSON.stringify(result));
 }finally{session.close();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
