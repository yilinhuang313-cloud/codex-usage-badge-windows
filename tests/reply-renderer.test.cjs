const test=require('node:test'),assert=require('node:assert/strict');
const {formatUsageLabel,detailLines}=require('../addons/reply-usage/renderer.cjs');
test('label reports unknown, partial, running and complete without fabricated zero',()=>{
 assert.equal(formatUsageLabel(null),'本轮用量：暂无数据');
 assert.match(formatUsageLabel({status:'running',usage:{total_tokens:120}}),/统计中/);
 assert.match(formatUsageLabel({status:'complete',usage:{total_tokens:1250}}),/1,250 Token/);
 assert.match(formatUsageLabel({status:'complete',usage:{total_tokens:10},partial:true}),/部分记录/);
 assert.match(formatUsageLabel({ambiguous:true,usage:{total_tokens:10}}),/无法匹配/);
});
test('details distinguish cached and reasoning subcounts and observed quota changes',()=>{
 const text=detailLines({status:'complete',usage:{input_tokens:100,cached_input_tokens:80,cache_write_input_tokens:0,output_tokens:20,reasoning_output_tokens:5,total_tokens:120},reasoningIncluded:true,quota:{primary:{percentagePoints:0,windowMinutes:300}}}).join('\n');
 assert.match(text,/120/);assert.match(text,/输入中的缓存/);assert.match(text,/推理 Token（单列/);
 assert.match(text,/百分点/);assert.match(text,/并行/);assert.match(text,/不代表/);
 assert.match(detailLines(null).join('\n'),/暂无/);
});
