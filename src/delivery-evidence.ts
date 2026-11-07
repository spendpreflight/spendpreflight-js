import {createHash} from 'node:crypto';

/** Caller assertions only. This module never performs I/O, signs, pays or retries. */
export type DeliveryOutcome = 'response_observed' | 'contract_mismatch' | 'unknown';
export interface DeliveryContract {
  status?: number;
  jsonType?: 'object' | 'array' | 'string' | 'number' | 'boolean' | 'null';
  requiredFields?: string[];
}
export interface DeliveryEvidenceInput {
  observedAt: string;
  method: string;
  resource: string;
  challengeBytes: Uint8Array;
  requestBytes: Uint8Array;
  receiptBytes: Uint8Array;
  paymentReference?: {txHash: string; logIndex: number};
  response?: {status: number; body?: Uint8Array; complete: boolean};
  transportError?: 'timeout' | 'aborted' | 'network';
  contract?: DeliveryContract;
}
export interface DeliveryEvidence {
  format: 'spendpreflight-client-evidence/1';
  provenance: 'unsigned_client_report';
  correlation: 'client_reported' | 'unknown';
  signatureVerification: 'not_performed';
  algorithm: 'sha256';
  serialization: 'fixed-fields-json-utf8/v1';
  observedAt: string;
  method: string;
  resourceSha256: string;
  challengeSha256: string;
  requestSha256: string;
  receiptSha256: string;
  contractSha256: string;
  responseSha256: string | null;
  responseBytes: number | null;
  httpStatus: number | null;
  transportError: string | null;
  paymentReference: {txHash: string; logIndex: number} | null;
  validator: 'bounded-json-contract/1';
  failedRules: string[];
  unknownReasons: string[];
  outcome: DeliveryOutcome;
}
const MAX_BYTES = 1024 * 1024;
const hash = (v: Uint8Array | string) => createHash('sha256').update(v).digest('hex');
function object(v: unknown): asserts v is Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v) || Object.getPrototypeOf(v) !== Object.prototype) throw Error('Expected plain object');
}
function fields(v: unknown, allowed: string[]) {
  object(v);
  if (Object.keys(v).some(k => !allowed.includes(k))) throw Error('Unsupported evidence field');
}
function bytes(v: unknown, nonempty = false): asserts v is Uint8Array {
  if (!(v instanceof Uint8Array) || v.byteLength > MAX_BYTES || (nonempty && !v.byteLength)) throw Error('Invalid or oversized evidence bytes');
}
function status(v: unknown): asserts v is number {
  if (!Number.isInteger(v) || (v as number) < 100 || (v as number) > 599) throw Error('Invalid HTTP status');
}
function reference(v: unknown): asserts v is {txHash: string; logIndex: number} {
  fields(v, ['txHash', 'logIndex']); const r = v as {txHash: string; logIndex: number};
  if (typeof r.txHash !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(r.txHash) || !Number.isSafeInteger(r.logIndex) || r.logIndex < 0) throw Error('Invalid payment event identity');
}
function canonicalContract(raw: DeliveryContract | undefined): DeliveryContract {
  if (raw === undefined) return {};
  fields(raw, ['status', 'jsonType', 'requiredFields']);
  if (raw.status !== undefined) status(raw.status);
  if (raw.jsonType !== undefined && !['object', 'array', 'string', 'number', 'boolean', 'null'].includes(raw.jsonType)) throw Error('Unsupported JSON type');
  if (raw.requiredFields !== undefined && (!Array.isArray(raw.requiredFields) || raw.requiredFields.length > 32 || raw.requiredFields.some(k => typeof k !== 'string' || !/^[A-Za-z_][A-Za-z0-9_-]{0,63}$/.test(k)) || new Set(raw.requiredFields).size !== raw.requiredFields.length)) throw Error('Invalid required fields');
  if (raw.requiredFields !== undefined && raw.jsonType !== 'object') throw Error('Required fields need object contract');
  return {...(raw.status !== undefined ? {status: raw.status} : {}), ...(raw.jsonType !== undefined ? {jsonType: raw.jsonType} : {}), ...(raw.requiredFields !== undefined ? {requiredFields: [...raw.requiredFields].sort()} : {})};
}
/** Hash exact caller-provided bytes. Receipt bytes remain unchanged and are never countersigned. */
export function createDeliveryEvidence(input: DeliveryEvidenceInput): DeliveryEvidence {
  fields(input, ['observedAt', 'method', 'resource', 'challengeBytes', 'requestBytes', 'receiptBytes', 'paymentReference', 'response', 'transportError', 'contract']);
  if (typeof input.observedAt !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(input.observedAt) || !Number.isFinite(Date.parse(input.observedAt)) || new Date(input.observedAt).toISOString() !== input.observedAt) throw Error('Expected exact UTC timestamp');
  if (typeof input.method !== 'string' || !/^[A-Z]{1,16}$/.test(input.method)) throw Error('Invalid method');
  if (typeof input.resource !== 'string' || input.resource.length > 8192) throw Error('Invalid resource');
  const url = new URL(input.resource); if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw Error('Invalid resource');
  bytes(input.challengeBytes, true); bytes(input.requestBytes); bytes(input.receiptBytes, true);
  const receipt = JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(input.receiptBytes));
  object(receipt); object(receipt.result); const result = receipt.result;
  if (result.kind !== 'payment_receipt') throw Error('Expected payment receipt');
  object(result.receipt); const event = result.receipt;
  reference({txHash: event.tx_hash, logIndex: event.log_index});
  if (input.paymentReference !== undefined) {
    reference(input.paymentReference);
    if (input.paymentReference.txHash.toLowerCase() !== (event.tx_hash as string).toLowerCase() || input.paymentReference.logIndex !== event.log_index) throw Error('Inconsistent payment event identity');
  }
  if (input.transportError !== undefined && !['timeout', 'aborted', 'network'].includes(input.transportError)) throw Error('Unsupported transport error');
  const r = input.response;
  if (r !== undefined) {
    fields(r, ['status', 'body', 'complete']); status(r.status);
    if (typeof r.complete !== 'boolean') throw Error('Response completeness required');
    if (r.body !== undefined) bytes(r.body);
  }
  const contract = canonicalContract(input.contract), failedRules: string[] = [], unknownReasons: string[] = [];
  if (!input.paymentReference) unknownReasons.push('payment_association_unknown');
  if (input.transportError) unknownReasons.push('transport_' + input.transportError);
  if (!r || r.body === undefined) unknownReasons.push('response_body_missing');
  if (r && !r.complete) unknownReasons.push('partial_response');
  if (r?.complete && r.body !== undefined && !input.transportError) {
    if (contract.status !== undefined && r.status !== contract.status) failedRules.push('http_status');
    if (contract.jsonType !== undefined) {
      try {
        const value: unknown = JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(r.body));
        const type = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
        if (type !== contract.jsonType) failedRules.push('json_type');
        if (contract.requiredFields && type === 'object') for (const key of contract.requiredFields) if (!Object.hasOwn(value as object, key)) failedRules.push('required_field:' + key);
      } catch { failedRules.push('invalid_json'); }
    }
  }
  return {
    format: 'spendpreflight-client-evidence/1', provenance: 'unsigned_client_report', correlation: input.paymentReference ? 'client_reported' : 'unknown', signatureVerification: 'not_performed',
    algorithm: 'sha256', serialization: 'fixed-fields-json-utf8/v1', observedAt: input.observedAt, method: input.method,
    resourceSha256: hash(input.resource), challengeSha256: hash(input.challengeBytes), requestSha256: hash(input.requestBytes), receiptSha256: hash(input.receiptBytes), contractSha256: hash(JSON.stringify(contract)),
    responseSha256: r?.body === undefined ? null : hash(r.body), responseBytes: r?.body?.byteLength ?? null, httpStatus: r?.status ?? null, transportError: input.transportError ?? null,
    paymentReference: input.paymentReference ? {txHash: input.paymentReference.txHash.toLowerCase(), logIndex: input.paymentReference.logIndex} : null,
    validator: 'bounded-json-contract/1', failedRules, unknownReasons,
    outcome: unknownReasons.length ? 'unknown' : failedRules.length ? 'contract_mismatch' : 'response_observed',
  };
}
/** Check a serialized attachment against retained source bytes. Integrity consistency, NOT authenticity or delivery proof. */
export function verifyDeliveryEvidence(serialized: string, input: DeliveryEvidenceInput): {valid: boolean; scope: 'source_consistency_only'} {
  try {
    if (typeof serialized !== 'string' || Buffer.byteLength(serialized, 'utf8') > 16384) throw Error('Oversized attachment');
    // Canonical serialization rejects unknown fields, duplicate keys and modified metadata as well as modified hashes.
    const expected = JSON.stringify(createDeliveryEvidence(input));
    return {valid: serialized === expected, scope: 'source_consistency_only'};
  } catch { return {valid: false, scope: 'source_consistency_only'}; }
}
