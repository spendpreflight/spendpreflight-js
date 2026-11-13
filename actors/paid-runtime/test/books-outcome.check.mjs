import {test} from 'node:test';
import assert from 'node:assert/strict';
import {BOOKS_LOOKUP_TIMEOUT_MS,requestBooks,booksOutcomeItem,deliverBooksOutcome} from '../src/books-outcome.mjs';

const failure=(status,code,stage='product_lookup')=>new Response(JSON.stringify({failure_stage:stage,failure_code:code}),{status});
async function outcome(operation,fetcher,options={}){
 const diagnostic={stage:'channel_request'};
 try{await requestBooks({},operation,diagnostic,{fetcher,...options});assert.fail('Expected no completed lookup');}
 catch(error){return {error,item:booksOutcomeItem(error,operation),diagnostic};}
}

test('Books request has a 45-second deadline; an abort-ignoring transport cannot hang the wrapper',async()=>{
 assert.equal(BOOKS_LOOKUP_TIMEOUT_MS,45000);
 let signal,calls=0;
 const {item}=await outcome('receipt',async(_url,init)=>{calls++;signal=init.signal;return new Promise(()=>{});},{timeoutMs:10});
 assert.equal(calls,1);assert.equal(signal.aborted,true);
 assert.equal(item.status,'unavailable');assert.equal(item.reason,'lookup_deadline_exceeded');
 assert.equal(item.result,null);assert.equal(item.verified,false);
});

test('deadline covers response-body reads, not only response headers',async()=>{
 const {item}=await outcome('statement',async()=>({ok:true,json:()=>new Promise(()=>{})}),{timeoutMs:10});
 assert.equal(item.reason,'lookup_deadline_exceeded');
 assert.equal(item.complete,false);assert.equal(item.reconciled,false);
 assert.deepEqual(item.coverage,{status:'unknown'});assert.deepEqual(item.rows,[]);
 assert.match(item.message,/not an empty-history determination/);
});

test('RPC unavailability becomes one honest dataset item without an event charge or fake export',async()=>{
 for(const op of ['receipt','statement']){
  const {error,item,diagnostic}=await outcome(op,async()=>failure(503,'rpc_unavailable'));
  assert.equal(item.status,'unavailable');assert.equal(item.completed_result_event_charged,false);
  assert.equal(diagnostic.code,'rpc_unavailable');
  const rows=[];const actor={pushData:async row=>rows.push(row),charge:()=>assert.fail('No completed result to charge'),setValue:()=>assert.fail('No HTML/CSV to export')};
  assert.equal(await deliverBooksOutcome(error,op,actor),true);
  assert.deepEqual(rows,[item]);
  assert.equal(booksOutcomeItem(error,op==='receipt'?'statement':'receipt'),null);
 }
});

test('missing transfers are explicit no-results, with no verified receipt',async()=>{
 for(const code of ['transaction_not_found_or_pending','usdc_transfer_not_found']){
  const {item}=await outcome('receipt',async()=>failure(503,code));
  assert.equal(item.status,'no_results');assert.equal(item.verified,false);assert.equal(item.result,null);
  assert.match(item.message,/missing or pending/);
 }
});

test('auth, missing configuration, stale sanctions and chain-integrity failures still fail',async()=>{
 for(const [status,code,stage] of [[403,'channel_unauthorized','application_proof'],[503,'infura_configuration_required','product_lookup'],[503,'rpc_unavailable','application_proof'],[503,'sanctions_unavailable','product_lookup'],[503,'wrong_chain','product_lookup'],[503,'chain_reorganized','product_lookup'],[503,'balance_reconciliation_failed','product_lookup'],[503,'unavailable','product_lookup']]){
  const {item}=await outcome('receipt',async()=>failure(status,code,stage));
  assert.equal(item,null,code+' must not be hidden as a successful lookup outcome');
 }
});

test('successful response is passed through once; malformed success is not converted to an empty result',async()=>{
 const body={result:{complete:true,reconciled:true,rows:[]}};let calls=0;
 assert.deepEqual(await requestBooks({},'statement',{}, {fetcher:async()=>{calls++;return Response.json(body);}}),body);
 assert.equal(calls,1);
 const {item}=await outcome('receipt',async()=>new Response('not json'));
 assert.equal(item,null);
});

test('dataset delivery failure propagates, with no second attempt',async()=>{
 const {error}=await outcome('statement',async()=>failure(503,'rpc_unavailable'));
 let writes=0;
 await assert.rejects(()=>deliverBooksOutcome(error,'statement',{pushData:async()=>{writes++;throw Error('storage unavailable');}}));
 assert.equal(writes,1);
});

test('network failure is unavailability; non-Books products are rejected without a request',async()=>{
 const {item}=await outcome('receipt',async()=>{throw TypeError('private network detail must never be copied');});
 assert.equal(item.reason,'channel_transport_unavailable');
 assert.doesNotMatch(JSON.stringify(item),/private network detail/);
 await assert.rejects(()=>requestBooks({},'token',{}, {fetcher:()=>assert.fail('No Token request')}));
});
