import {test} from 'node:test';import assert from 'node:assert/strict';
import {parseInput,proofRegistry,deliver} from '../src/channel.mjs';
const now=Date.parse('2026-10-26T00:00:00Z'),address='0x'+'0'.repeat(40),hash='0x'+'0'.repeat(64),range={start:'2026-10-24T00:00:00Z',end:'2026-10-25T00:00:00Z'};
test('validates distinct receipt modes, ranges and unknown fields before RPC/billing',()=>{
 assert.deepEqual(parseInput({tx_hash:hash},'receipt',now),{tx_hash:hash});
 assert.doesNotThrow(()=>parseInput({pay_to:address,amount:'1.000001',...range},'receipt',now));
 assert.doesNotThrow(()=>parseInput({address,...range},'statement',now));
 for(const v of [{tx_hash:hash,pay_to:address},{tx_hash:'bad'},{pay_to:address,amount:'1.0000001',...range},{pay_to:address,amount:'1',...range,start:'2026-01-01T00:00:00Z'}])assert.throws(()=>parseInput(v,'receipt',now));
 assert.throws(()=>parseInput({address,...range,secret:'no'},'statement',now));assert.throws(()=>parseInput({address,...range,end:'2026-10-28T00:00:00Z'},'statement',now));
});
test('Lint rejects unsafe schemes, credentials, fragments, unknown fields and methods',()=>{
 assert.doesNotThrow(()=>parseInput({url:'https://example.com/data',method:'POST'},'lint'));
 for(const url of ['http://example.com','https://user:pass@example.com','https://example.com/#secret'])assert.throws(()=>parseInput({url,method:'GET'},'lint'));
 assert.throws(()=>parseInput({url:'https://example.com',method:'DELETE'},'lint'));
});
test('body proof is single use, binds operation and never exposes original input',()=>{
 const p=proofRegistry('receipt'),nonce=p.add({tx_hash:hash});let code,body;const res={writeHead(n){code=n;},end(s){body=JSON.parse(s);}};
 p.handler({method:'GET',url:'/spendpreflight-proof/'+nonce},res);assert.equal(code,200);assert.equal(body.operation,'receipt');assert.deepEqual(Object.keys(body).sort(),['digest','operation']);
 p.handler({method:'GET',url:'/spendpreflight-proof/'+nonce},res);assert.equal(code,404);
});
test('one event per export rather than per transfer and no output on declined charge',async()=>{
 const calls=[];const actor={charge:async x=>(calls.push(x),{chargedCount:1}),pushData:async()=>calls.push('dataset'),setValue:async k=>calls.push(k)};
 await deliver({rows:Array(100).fill({}),csv:'test'}, {operation:'statement',event:'statement-created'},actor);
 assert.deepEqual(calls,[{eventName:'statement-created',count:1},'dataset','statement.csv']);
 assert.equal(await deliver({}, {operation:'lint',event:'listing-checked'},{charge:async()=>({chargedCount:0}),pushData:async()=>assert.fail()}),false);
});
