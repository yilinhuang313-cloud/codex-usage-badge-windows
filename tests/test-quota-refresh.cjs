'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const agent=process.env.BADGE_AGENT_UNDER_TEST||path.join(process.env.LOCALAPPDATA,'CodexUsageBadge','agent.cjs');
const {AppServerClient}=require(agent);
const fixture=`const rl=require('node:readline').createInterface({input:process.stdin});
let reads=0;rl.on('line',line=>{const m=JSON.parse(line);if(!m.id)return;
if(m.method==='initialize')return console.log(JSON.stringify({id:m.id,result:{}}));
if(m.method==='account/rateLimits/read'){reads++;const respond=()=>console.log(JSON.stringify({id:m.id,result:{rateLimits:{limitId:'codex',primary:{usedPercent:12,windowDurationMins:300,resetsAt:2000000000}}}}));
if(process.env.QUOTA_FIXTURE_MODE==='error'&&reads===2)return console.log(JSON.stringify({id:m.id,error:{message:'Temporary quota failure'}}));
setTimeout(respond,process.env.QUOTA_FIXTURE_MODE==='slow'?11000:5);}});`;
test('a valid quota response taking eleven seconds is accepted',async()=>{
 const saved=process.env.QUOTA_FIXTURE_MODE;process.env.QUOTA_FIXTURE_MODE='slow';
 const client=new AppServerClient({command:process.execPath,args:['-e',fixture]});
 try{await client.start();assert.equal(client.rateLimits.rateLimits.primary.usedPercent,12);assert.equal(client.pending.size,0);}
 finally{client.stop();if(saved===undefined)delete process.env.QUOTA_FIXTURE_MODE;else process.env.QUOTA_FIXTURE_MODE=saved;}
});
test('a failed quota request does not prevent the next refresh',async()=>{
 const saved=process.env.QUOTA_FIXTURE_MODE;process.env.QUOTA_FIXTURE_MODE='error';
 const client=new AppServerClient({command:process.execPath,args:['-e',fixture]});
 try{await client.start();await assert.rejects(client.refresh(),/Temporary quota failure/);assert.equal(client.pending.size,0);await client.refresh();assert.equal(client.rateLimits.rateLimits.primary.usedPercent,12);}
 finally{client.stop();if(saved===undefined)delete process.env.QUOTA_FIXTURE_MODE;else process.env.QUOTA_FIXTURE_MODE=saved;}
});
