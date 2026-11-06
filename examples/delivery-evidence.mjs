import {createDeliveryEvidence, verifyDeliveryEvidence} from '../dist/delivery-evidence.js';
// Synthetic fixture only. Replace with retained bytes from a separately authorized, already completed call.
const bytes = (s) => new TextEncoder().encode(s);
const txHash = '0x' + '1'.repeat(64);
const input = {
  observedAt: '2026-11-06T00:00:00.000Z', method: 'POST', resource: 'https://example.invalid/data',
  challengeBytes: bytes('{"fixture":true}'), requestBytes: bytes('{}'),
  receiptBytes: bytes(JSON.stringify({result: {kind: 'payment_receipt', receipt: {tx_hash: txHash, log_index: 0}}, jws: 'UNVERIFIED-FIXTURE'})),
  paymentReference: {txHash, logIndex: 0},
  response: {status: 200, body: bytes('{"answer":42}'), complete: true},
  contract: {status: 200, jsonType: 'object', requiredFields: ['answer']},
};
const evidence = createDeliveryEvidence(input);
console.log(evidence.outcome); // response_observed: caller assertion, NOT independent delivery proof
console.log(verifyDeliveryEvidence(JSON.stringify(evidence), input)); // source consistency only
