const test=require('node:test'),assert=require('node:assert/strict');
const {isSupportedTarget,isLoopbackSocket}=require('../addons/reply-usage/agent.cjs');
test('only Codex conversation windows are eligible, including detached windows',()=>{
 assert.equal(isSupportedTarget({type:'page',url:'app://-/index.html'}),true);
 assert.equal(isSupportedTarget({type:'page',url:'app://-/detached-window.html?initialRoute=%2Fdetached-window'}),true);
 for(const url of ['https://chatgpt.com/','app://-/index.html?initialRoute=%2Favatar-overlay','app://other/index.html','app://-/settings.html'])assert.equal(isSupportedTarget({type:'page',url}),false);
 assert.equal(isSupportedTarget({type:'iframe',url:'app://-/index.html'}),false);
});
test('CDP socket is restricted to the current loopback endpoint',()=>{
 assert.equal(isLoopbackSocket('ws://127.0.0.1:39222/devtools/page/abc',39222),true);
 for(const u of ['ws://evil.test:39222/a','wss://127.0.0.1:39222/a','ws://127.0.0.1:80/a','ws://user:pass@127.0.0.1:39222/a'])assert.equal(isLoopbackSocket(u,39222),false);
});
