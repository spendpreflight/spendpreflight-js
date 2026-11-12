import {test} from 'node:test';
import assert from 'node:assert/strict';
import {rebuildBooks} from '../../../tools/apify/rebuild-books.mjs';
const old='12345678901234567',next={id:'76543210987654321',status:'SUCCEEDED',buildNumber:'0.1.8'};
const sourceFiles=[{name:'src/main.mjs',format:'TEXT',content:'// fixed source'}];
function actor(op){return {id:op==='receipt'?'Q6mFhTZ1lbt6eNA0P':'Cb9T1AqAIr19SP8yp',username:'spendpreflight',name:op==='receipt'?'usdc-payment-receipt-base':'usdc-wallet-statement-base',isPublic:true,taggedBuilds:{latest:{buildId:old}},actorPermissionLevel:'LIMITED_PERMISSIONS',defaultRunOptions:{timeoutSecs:120},pricingInfos:[{pricingModel:'PAY_PER_EVENT',pricingPerEvent:{actorChargeEvents:{[op+'-created']:{eventPriceUsd:op==='receipt'?0.005:0.05}}}}]};}

test('rebuilds each exact existing Books Actor once without runs, auth, pricing or settings writes',async()=>{
 for(const op of ['receipt','statement']){
  const a=actor(op),calls=[],states=[];
  const result=await rebuildBooks({operation:op,actor:a,expectedBuildId:old,sourceFiles,record:s=>states.push(s),request:async(method,path,body)=>{
   calls.push({method,path,body});
   if(method==='POST'){assert.equal(states.at(-1).state,'SOURCE_UPDATED_BUILD_INTENT');return next;}
   if(method==='GET')return {...a,taggedBuilds:{latest:{buildId:next.id}}};
  }});
  assert.equal(result.state,'REBUILT_NO_RUNS_METADATA_UNCHANGED');
  assert.equal(result.verification_starts,0);
  assert.deepEqual(calls.map(c=>c.method),['PUT','POST','GET']);
  assert.deepEqual(calls[0].body,{sourceType:'SOURCE_FILES',sourceFiles});
  assert.ok(calls.every(c=>!/(env-vars|runs|pricing|payout)/.test(c.path)));
 }
});

test('wrong actor, build, product or pricing blocks before any platform mutation',async()=>{
 for(const options of [{expectedBuildId:'different'},{operation:'token'},{actor:{...actor('receipt'),id:'different'}},{actor:{...actor('receipt'),pricingInfos:[]}}]){
  await assert.rejects(()=>rebuildBooks({operation:'receipt',actor:actor('receipt'),expectedBuildId:old,sourceFiles,record:()=>assert.fail(),request:()=>assert.fail('No mutation'),...options}));
 }
});

test('unknown build outcome retains intent and never posts a second build',async()=>{
 let builds=0;const states=[];
 await assert.rejects(()=>rebuildBooks({operation:'receipt',actor:actor('receipt'),expectedBuildId:old,sourceFiles,record:s=>states.push(s),request:async method=>{if(method==='POST'){builds++;throw Error('ambiguous transport');}}}));
 assert.equal(builds,1);assert.equal(states.at(-1).state,'SOURCE_UPDATED_BUILD_INTENT');
});

test('failed build and unexpected metadata changes are not reported complete',async()=>{
 for(const failed of [true,false]){
  const a=actor('statement');
  await assert.rejects(()=>rebuildBooks({operation:'statement',actor:a,expectedBuildId:old,sourceFiles,record:()=>{},request:async method=>{
   if(method==='POST')return {...next,status:failed?'FAILED':'SUCCEEDED'};
   if(method==='GET')return {...a,isPublic:false,taggedBuilds:{latest:{buildId:next.id}}};
  }}));
 }
});
