# Client evidence (optional)

Free offline SDK helpers `createDeliveryEvidence` and `verifyDeliveryEvidence` create a separate unsigned attachment alongside an already obtained Receipt. They never modify the signed Receipt, send data, access files, fetch URLs/keys, pay, replay or retry. Existing Receipt API/schema and 0.01 USDC price remain unchanged. No server countersignature or merchant-signature interoperability is provided.

See [the executable synthetic example](../examples/delivery-evidence.mjs). Run `npm run build` then `node examples/delivery-evidence.mjs`. The example itself contains no network or payment operation.

Supply exact challenge, request-body, response-body and Receipt-envelope bytes. `resource` is hashed exactly as supplied; it is never emitted. No headers or cookies are accepted. Resource userinfo is rejected. Keep private URLs, bytes and attachments in caller-controlled storage; even hashes can reveal low-entropy values or correlate activity. This helper does not save anything by default. Do not attach it to the existing server input.

`paymentReference` must match the single Receipt transaction and log index. Matching is only client-reported association, not chain or signature verification. Missing association produces `unknown`; contradictory identities throw. Repeated evidence for the same event is deterministic, not a new payment or delivery observation. Deduplicate by transaction AND log index in your own storage.

Outcomes:
- `response_observed`: complete caller-reported bytes and a matching caller-reported payment reference, with no supplied contract violation. Even HTTP 500 can be observed if no expected status was supplied; this is not a delivery or quality guarantee.
- `contract_mismatch`: explicit expected status, JSON type or required top-level field failed on a complete response. No subjective quality judgement.
- `unknown`: timeout, abort, network error, partial stream, missing body or missing payment association. Timeout may occur after settlement; never authorize another payment from this result.

Contracts support only `status`, `jsonType` and up to32 unique required fields (object contracts only). No JSON Schema execution, `$ref`, regular expressions, callbacks or external validation. Inputs are limited to1MiB per byte buffer and8192 resource characters. Verification accepts canonical attachment JSON at most16KiB. Hashes are lowercase SHA-256 over exact supplied bytes; resource hash uses exact UTF-8 string; contract hash uses UTF-8 JSON with fixed field order status/jsonType/requiredFields and sorted required fields. Serialization version is `fixed-fields-json-utf8/v1`.

Retain `JSON.stringify(evidence)` exactly. `verifyDeliveryEvidence(serialized, input)` recomputes it and checks byte-for-byte consistency, detecting changed hashes, metadata, unknown/duplicate fields and source bytes. It does not establish authenticity: an attacker controlling both attachment and source evidence can replace both. `signatureVerification` is always `not_performed`; forged/expired Receipt signatures are not accepted as valid signatures, and merchant-signature assertion fields are rejected. Validate the original Receipt independently through its existing verification interface when needed; this helper never invokes it. Merchant signatures, timestamps, payment finality, ownership, settlement and semantic correctness remain unverified.
