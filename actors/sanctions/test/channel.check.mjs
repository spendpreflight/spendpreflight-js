import {test} from 'node:test';import assert from 'node:assert/strict';
import {parseInput,proofRegistry,deliver} from '../src/channel.mjs';
const address='0x'+'0'.repeat(40);
test('rejects malformed/excessive/private extra input before network or billing',()=>{
 assert.deepEqual(parseInput({addresses:[address]}),{addresses:[address]});
 for(const v of [null,{addresses:[]},{addresses:Array(101).fill(address)},{addresses:['bad']},{addresses:[address],token:'secret'}])assert.throws(()=>parseInput(v));
});
test('container proof is one use and binds the exact pending body',()=>{
 const p=proofRegistry(),nonce=p.add({addresses:[address]});let status,body;
 const response={writeHead(s){status=s;},end(b){body=JSON.parse(b);}};
 p.handler({url:'/spendpreflight-proof/'+nonce,method:'GET'},response);assert.equal(status,200);assert.equal(body.operation,'sanctions');assert.match(body.digest,/^[a-f0-9]{64}$/);
 p.handler({url:'/spendpreflight-proof/'+nonce,method:'GET'},response);assert.equal(status,404);
});
test('event budget truncates delivery and a failed charge never publishes data',async()=>{
 let n=0;const saved=[];const actor={charge:async()=>({chargedCount:n++===0?1:0}),pushData:async row=>saved.push(row)};
 assert.equal(await deliver([{a:1},{a:2}],actor),1);assert.deepEqual(saved,[{a:1}]);
 await assert.rejects(()=>deliver([{}],{charge:async()=>{throw Error('billing unavailable');},pushData:async()=>assert.fail()}));
});
