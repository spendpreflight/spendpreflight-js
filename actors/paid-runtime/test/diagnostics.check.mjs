import {test} from 'node:test';
import assert from 'node:assert/strict';
import {failureLine} from '../src/diagnostics.mjs';
test('distinguishes local input, signing, channel proof and RPC failures using fixed codes',()=>{
 for(const stage of ['input_validation','application_signing','result_delivery'])assert.match(failureLine({stage}),new RegExp('stage='+stage));
 assert.match(failureLine({stage:'channel_request',channel_stage:'product_lookup',code:'rpc_unavailable',http_status:503}),/channel_stage=product_lookup; code=rpc_unavailable; http_status=503/);
 assert.match(failureLine({stage:'channel_request',channel_stage:'application_proof',code:'channel_unauthorized',http_status:503}),/channel_stage=application_proof; code=channel_unauthorized/);
});
test('never emits arbitrary messages, input, credentials or provider URLs',()=>{
 const secret='https://private.example/secret-key?address=private';
 const line=failureLine({stage:secret,channel_stage:secret,code:secret,http_status:secret,error:secret,input:secret});
 assert.doesNotMatch(line,/private|secret-key|address=/);assert.match(line,/stage=unknown; channel_stage=unknown; code=unavailable; http_status=unknown/);
});
