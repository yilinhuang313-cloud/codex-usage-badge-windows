'use strict';
function formatUsageLabel(turn){
 if(turn?.ambiguous)return '本轮用量：无法匹配';
 if(!turn?.usage)return turn?.status==='running'?'本轮用量：统计中':'本轮用量：暂无数据';
 const count=turn.usage.total_tokens.toLocaleString('zh-CN');
 return `本轮 ${count} Token${turn.partial?' · 部分记录':turn.status==='running'?' · 统计中':''}`;
}
function detailLines(turn){
 if(!turn?.usage||turn.ambiguous)return ['暂无可可靠匹配的本地用量记录。','仅支持当前电脑保存的 Codex 会话记录，不按回复顺序猜测。'];
 const u=turn.usage,n=value=>Number.isSafeInteger(value)?value.toLocaleString('zh-CN'):'暂无数据';
 const lines=[`总 Token：${n(u.total_tokens)}`,`输入：${n(u.input_tokens)}`,`  输入中的缓存：${n(u.cached_input_tokens)}`];
 if(u.cache_write_input_tokens)lines.push(`  缓存写入：${n(u.cache_write_input_tokens)}`);
 lines.push(`输出：${n(u.output_tokens)}`,`推理 Token（单列，不再次加总）：${n(u.reasoning_output_tokens)}`);
 if(turn.model)lines.push(`模型：${turn.model}`);
 if(Number.isFinite(turn.durationMs))lines.push(`本轮时长：${(turn.durationMs/1000).toFixed(1)} 秒`);
 lines.push('','期间账户额度变化（参考）：');
 let observed=false;
 for(const key of ['primary','secondary']){const q=turn.quota?.[key];if(!q)continue;observed=true;const label=q.windowMinutes===300?'5 小时':q.windowMinutes===10080?'每周':`${q.windowMinutes} 分钟`;lines.push(`${label}：增加 ${q.percentagePoints} 个百分点`);}
 if(!observed)lines.push('暂无可比较的同窗口快照');
 lines.push('此差值可能含并行聊天，且受刷新延迟和百分比精度影响；不代表本轮的精确扣费。','输入已含缓存。推理单列供参考；总量使用记录值，不重复相加，也不等同于账单。');
 if(turn.partial)lines.push('仅有部分记录：会话累计计数发生过重置，或起始基线缺失。');
 if(turn.status==='running')lines.push('本轮尚未结束，统计会继续更新。');
 if(turn.status==='interrupted')lines.push('本轮已中断，显示已记录的部分。');
 return lines;
}
function installReplyUsage(window=globalThis){
 const document=window.document,KEY='__codexReplyUsage',VERSION='1.1.0';
 if(window[KEY]?.version===VERSION){window[KEY].refresh();return;}
 window[KEY]?.dispose?.();
 const UUID=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
 const buttons=new Map(),abort=new window.AbortController();
 let snapshot={turns:{},checkedAt:0},disposed=false,scheduled=null,opened=null,focusBefore=null;
 const style=document.createElement('style');style.id='codex-reply-usage-style';
 style.textContent=`
 .codex-reply-usage{font:inherit;font-size:11px;line-height:20px;color:var(--color-text-tertiary,#74808b);border:0;background:transparent;border-radius:5px;padding:0 5px;margin-inline-start:5px;cursor:pointer;white-space:nowrap;opacity:1!important}
 .codex-reply-usage:hover,.codex-reply-usage:focus-visible{background:var(--color-background-secondary,rgba(128,128,128,.1));color:var(--color-text,#6a727c)}
 .codex-reply-usage[data-stale=true]{opacity:.6!important}
 #codex-reply-usage-dialog{position:fixed;z-index:2147483001;box-sizing:border-box;width:min(380px,calc(100vw - 24px));max-height:min(480px,70vh);overflow:auto;padding:14px 16px;border:1px solid rgba(128,128,128,.3);border-radius:12px;background:var(--color-background,var(--color-bg,#fff));color:var(--color-text,#303842);box-shadow:0 8px 28px #0002;font:12px/1.65 system-ui,sans-serif;white-space:pre-wrap;overflow-wrap:anywhere}
 html.dark #codex-reply-usage-dialog,html[data-theme=dark] #codex-reply-usage-dialog{background:var(--color-background,#262626);color:var(--color-text,#eee)}
 #codex-reply-usage-dialog[hidden]{display:none!important}.codex-reply-usage-close{float:right;cursor:pointer;font:inherit;background:transparent;border:0;color:inherit;padding:0 5px}
 `;document.head.append(style);
 const dialog=document.createElement('div');dialog.id='codex-reply-usage-dialog';dialog.setAttribute('role','dialog');dialog.setAttribute('aria-label','本轮用量明细');dialog.hidden=true;
 const close=document.createElement('button');close.type='button';close.className='codex-reply-usage-close';close.textContent='×';close.setAttribute('aria-label','关闭用量明细');
 const title=document.createElement('strong');title.textContent='本轮用量明细';
 const body=document.createElement('div');dialog.append(close,title,body);document.body.append(dialog);
 const identity=host=>{const turn=host.closest('[data-content-search-turn-key]')?.getAttribute('data-content-search-turn-key');return UUID.test(turn??'')?turn.toLowerCase():null;};
 const hosts=()=>[...document.querySelectorAll('[data-local-conversation-final-assistant="true"]')];
 function hide(){if(opened)opened.button.setAttribute('aria-expanded','false');opened=null;dialog.hidden=true;}
 function place(){
  if(!opened||!opened.button.isConnected){hide();return;}
  const r=opened.button.getBoundingClientRect();const width=Math.min(380,window.innerWidth-24);
  dialog.style.left=Math.max(12,Math.min(r.left,window.innerWidth-width-12))+'px';
  const h=dialog.getBoundingClientRect().height;dialog.style.top=Math.max(12,r.bottom+8+h>window.innerHeight?r.top-h-8:r.bottom+8)+'px';
 }
 function updateDialog(){if(!opened)return;const t=snapshot.turns[opened.id];body.textContent=window.__codexReplyUsageDetails(t).join('\n');place();}
 function refresh(){
  if(disposed)return;
  const live=new Set();
  for(const host of hosts()){
   const id=identity(host),bar=host.querySelector('.turn-action-controls');if(!id||!bar)continue;
   live.add(host);let entry=buttons.get(host);
   if(!entry){
    const button=document.createElement('button');button.type='button';button.className='codex-reply-usage';button.setAttribute('aria-haspopup','dialog');button.setAttribute('aria-expanded','false');
    entry={button,id};buttons.set(host,entry);bar.append(button);
    button.addEventListener('click',()=>{
     if(opened?.button===button){hide();return;}
     hide();focusBefore=button;opened=entry;button.setAttribute('aria-expanded','true');dialog.hidden=false;updateDialog();close.focus({preventScroll:true});
    },{signal:abort.signal});
   }
   entry.id=id;const text=window.__codexReplyUsageLabel(snapshot.turns[id]);
   if(entry.button.textContent!==text)entry.button.textContent=text;
   const stale=Date.now()-snapshot.checkedAt>20000;entry.button.dataset.stale=String(stale);
   entry.button.title=stale?'本地统计尚未连接或已过期；点击查看上次记录':'点击查看本轮输入、缓存、输出和额度变化';
   if(!entry.button.isConnected)bar.append(entry.button);
  }
  for(const [host,entry]of buttons)if(!live.has(host)){entry.button.remove();buttons.delete(host);}
  updateDialog();
 }
 function schedule(){if(disposed||scheduled!==null)return;scheduled=window.requestAnimationFrame(()=>{scheduled=null;refresh();});}
 const observer=new window.MutationObserver(records=>{if(records.some(r=>!dialog.contains(r.target)&&![...buttons.values()].some(x=>x.button===r.target||x.button.contains(r.target))))schedule();});
 observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['data-content-search-turn-key','data-local-conversation-final-assistant']});
 close.addEventListener('click',()=>{hide();focusBefore?.focus({preventScroll:true});},{signal:abort.signal});
 document.addEventListener('pointerdown',e=>{if(opened&&!dialog.contains(e.target)&&!opened.button.contains(e.target))hide();},{signal:abort.signal});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&opened){hide();focusBefore?.focus({preventScroll:true});}},{signal:abort.signal});
 window.addEventListener('scroll',place,{capture:true,passive:true,signal:abort.signal});window.addEventListener('resize',place,{signal:abort.signal});
 const staleTimer=window.setInterval(refresh,10000);
 window[KEY]={version:VERSION,refresh,requestedIds:()=>[...new Set(hosts().map(identity).filter(Boolean))].slice(0,500),
  update(value){if(!value||typeof value.turns!=='object')return;snapshot=value;refresh();},
  status(){return{version:VERSION,badges:buttons.size,ready:[...buttons.values()].filter(e=>snapshot.turns[e.id]?.usage&&!snapshot.turns[e.id]?.ambiguous).length,checkedAt:snapshot.checkedAt,dialogOpen:!!opened};},
  dispose(){disposed=true;abort.abort();observer.disconnect();window.clearInterval(staleTimer);if(scheduled!==null)window.cancelAnimationFrame(scheduled);for(const e of buttons.values())e.button.remove();buttons.clear();dialog.remove();style.remove();delete window[KEY];}
 };refresh();
}
function bootstrap(){return `window.__codexReplyUsageLabel=${formatUsageLabel.toString()};window.__codexReplyUsageDetails=${detailLines.toString()};(${installReplyUsage.toString()})();`;}
module.exports={formatUsageLabel,detailLines,installReplyUsage,bootstrap};
