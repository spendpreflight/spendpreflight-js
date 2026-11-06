import {describe,it,expect,vi} from 'vitest';
import {createDeliveryEvidence,verifyDeliveryEvidence,type DeliveryEvidenceInput} from '../src/delivery-evidence';
const b=(s:string)=>new TextEncoder().encode(s),tx='0x'+'1'.repeat(64);
const fixture=():DeliveryEvidenceInput=>({observedAt:'2026-11-06T00:00:00.000Z',method:'POST',resource:'https://example.invalid/private?key=secret#private',challengeBytes:b('{"price":"1"}'),requestBytes:b('{"secret":"private"}'),receiptBytes:b(JSON.stringify({result:{kind:'payment_receipt',receipt:{tx_hash:tx,log_index:2}},jws:'unverified-fixture'})),paymentReference:{txHash:tx,logIndex:2},response:{status:200,body:b('{"answer":42}'),complete:true},contract:{status:200,jsonType:'object',requiredFields:['answer']}});
describe('offline client evidence',()=>{
 it('correlates exact event and bytes without network, persistence or signature claims',()=>{
  const fetcher=vi.spyOn(globalThis,'fetch').mockImplementation(()=>{throw Error('network forbidden')});
  try {const x=fixture(),before=JSON.stringify(x),r=createDeliveryEvidence(x);expect(r.outcome).toBe('response_observed');expect(r.provenance).toBe('unsigned_client_report');expect(r.signatureVerification).toBe('not_performed');expect(JSON.stringify(x)).toBe(before);expect(fetcher).not.toHaveBeenCalled();expect(verifyDeliveryEvidence(JSON.stringify(r),x).valid).toBe(true);expect(JSON.stringify(r)).not.toMatch(/example.invalid|secret|private|answer":42|unverified-fixture/);}finally{fetcher.mockRestore();}
 });
 it('reports explicit JSON and status mismatches without claiming nondelivery',()=>{
  const x=fixture();x.response={status:500,body:b('{"other":1}'),complete:true};const r=createDeliveryEvidence(x);expect(r.outcome).toBe('contract_mismatch');expect(r.failedRules).toEqual(['http_status','required_field:answer']);
  x.response.body=b('[]');expect(createDeliveryEvidence(x).failedRules).toContain('json_type');x.response.body=b('broken');expect(createDeliveryEvidence(x).failedRules).toContain('invalid_json');
 });
 it('keeps timeout after possible settlement, missing bytes, partial and ambiguous association unknown',()=>{
  const x=fixture();x.transportError='timeout';expect(createDeliveryEvidence(x).outcome).toBe('unknown');delete x.transportError;x.response!.complete=false;expect(createDeliveryEvidence(x).outcome).toBe('unknown');x.response!.complete=true;delete x.response!.body;expect(createDeliveryEvidence(x).outcome).toBe('unknown');delete x.paymentReference;expect(createDeliveryEvidence(x).unknownReasons).toContain('payment_association_unknown');
 });
 it('rejects different transaction or log, arrays of duplicate events and unsupported signature assertions',()=>{
  const x=fixture();x.paymentReference!.logIndex=3;expect(()=>createDeliveryEvidence(x)).toThrow(/Inconsistent/);x.paymentReference!.logIndex=2;x.paymentReference!.txHash='0x'+'2'.repeat(64);expect(()=>createDeliveryEvidence(x)).toThrow(/Inconsistent/);
  const y=fixture();y.receiptBytes=b(JSON.stringify({result:{kind:'payment_receipt',receipt:[{tx_hash:tx,log_index:2},{tx_hash:tx,log_index:2}]}}));expect(()=>createDeliveryEvidence(y)).toThrow();
  for(const signature of [{value:'forged'},{value:'expired',expiresAt:'2000-01-01'}])expect(()=>createDeliveryEvidence({...fixture(),merchantSignature:signature} as any)).toThrow(/Unsupported/);
 });
 it('does not claim signature validity for a forged or expired receipt envelope',()=>{
  for(const jws of ['forged','expired']) {const x=fixture();x.receiptBytes=b(JSON.stringify({result:{kind:'payment_receipt',receipt:{tx_hash:tx,log_index:2}},jws}));expect(createDeliveryEvidence(x).signatureVerification).toBe('not_performed');}
 });
 it('detects modified hashes, metadata, source bytes, unsupported algorithms and duplicate serialized fields',()=>{
  const x=fixture(),r=createDeliveryEvidence(x),s=JSON.stringify(r);
  for(const changed of [{...r,responseSha256:'0'.repeat(64)},{...r,algorithm:'md5'},{...r,outcome:'unknown'},{...r,provenance:'merchant_signed'}])expect(verifyDeliveryEvidence(JSON.stringify(changed),x).valid).toBe(false);
  expect(verifyDeliveryEvidence(s.replace('{','{"outcome":"unknown",'),x).valid).toBe(false);x.response!.body=b('{"answer":43}');expect(verifyDeliveryEvidence(s,x).valid).toBe(false);
 });
 it('rejects executable or remote contracts and enforces byte/attachment bounds',()=>{
  for(const extra of [{$ref:'https://example.invalid/schema'},{validate:()=>true},{pattern:'.*'}])expect(()=>createDeliveryEvidence({...fixture(),contract:{...extra} as any})).toThrow();
  expect(()=>createDeliveryEvidence({...fixture(),requestBytes:new Uint8Array(1048577)})).toThrow();expect(verifyDeliveryEvidence(' '.repeat(16385),fixture()).valid).toBe(false);
 });
 it('handles empty complete bodies distinctly from missing bytes and rejects malformed timestamps',()=>{
  const x=fixture();x.response!.body=b('');delete x.contract;expect(createDeliveryEvidence(x).outcome).toBe('response_observed');expect(createDeliveryEvidence(x).responseBytes).toBe(0);
  x.observedAt='2026-02-30T00:00:00.000Z';expect(()=>createDeliveryEvidence(x)).toThrow();
 });
 it('is deterministic and does not treat repeated same-event evidence as new delivery or settlement',()=>{const x=fixture();expect(createDeliveryEvidence(x)).toEqual(createDeliveryEvidence(x));});
});
