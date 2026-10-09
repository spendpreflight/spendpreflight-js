import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { verifyReceipt } from '../src/index';
const fixture=JSON.parse(readFileSync(new URL('./fixtures/signed-receipt.json',import.meta.url),'utf8'));
it('verifies the real Worker cross-language vector with pinned public keys',async()=>{
 expect(await verifyReceipt(fixture.response,fixture.keys,{now:fixture.now})).toMatchObject({valid:true,decision:'allow'});
});
it('rejects tampering, stale/future decisions, revoked keys, extra response fields and untrusted keys',async()=>{
 for(const mutate of [(v:any)=>v.decision='block',(v:any)=>v.reasons.push('forged'),(v:any)=>v.receipt.input_sha256='b'.repeat(64),(v:any)=>v.receipt.jws+='a',(v:any)=>v.extra='x']){
   const body=structuredClone(fixture.response);mutate(body);expect(await verifyReceipt(body,fixture.keys,{now:fixture.now})).toMatchObject({valid:false});
 }
 expect(await verifyReceipt(fixture.response,fixture.keys,{now:fixture.now+3700000})).toMatchObject({valid:false});
 expect(await verifyReceipt(fixture.response,fixture.keys,{now:fixture.now-120000})).toMatchObject({valid:false});
 expect(await verifyReceipt(fixture.response,fixture.keys,{now:fixture.now+3700000,maxAgeSeconds:null})).toMatchObject({valid:true});
 expect(await verifyReceipt(fixture.response,{keys:[]},{now:fixture.now})).toMatchObject({valid:false});
 expect(await verifyReceipt(fixture.response,{keys:[{...fixture.keys.keys[0],revoked:true}]},{now:fixture.now})).toMatchObject({valid:false});
});
