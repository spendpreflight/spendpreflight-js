# USDC Payment Receipt — Base

SpendPreflight — trust and verification tools for stablecoin payments, built for AI agents and the people who run them.

Operated by SpendPreflight. Read-only native Base USDC transfer verification with payer/payee, amount, time, block, L2 confirmations, OFAC flags and signed printable receipt. This Actor wraps the existing deployed engine. No wallet or USDC payment is required for this USD channel.

## Input example

```json
{
  "tx_hash": "0x0000000000000000000000000000000000000000000000000000000000000000"
}
```

Examples are illustrative public/synthetic values, not verified payments or live results. Use your own public input. Unknown fields, malformed addresses/hashes, unsafe URLs and excessive date ranges fail before a chargeable result.

## Pricing

**$0.005 per completed result** (`receipt-created`), no startup event. Set max total charge per run. A result is charged once, independently of transfer count. Platform/post-run storage charges and discounts are controlled by Apify; check the Store pricing panel. Owner tests/free-plan runs do not establish revenue. No automatic retry after ambiguous billing/output failure.

## Privacy and permissions

Limited permissions. No owner token or Infura credential is embedded in Actor source; the Actions deployment secret never enters the runtime. Only a live run ID, one-use nonce and requested public inputs go to SpendPreflight. A digest served from the live Apify container binds the request to the official tagged build; no Apify API token is sent to SpendPreflight.

The Actor removes its default run INPUT after reading and never logs query/result values. SpendPreflight processes the request transiently. No new database, bucket, dataset or request queue is created by our wrapper. **Apify retains requested results in the user's default run dataset and default key-value store, plus run metadata and any saved tasks under its own retention policy.** Do not submit private data or assume platform-wide zero retention. Existing Lint/Guard robots/pacing/CDP observation metadata and public chain metadata caches keep their already disclosed retention; no raw request bodies are stored. [Product privacy](https://spendpreflight.com/privacy/) · [Live service status](https://status.spendpreflight.com/)

## Scope and output

Provide a Base tx hash (optional log index), OR exact pay_to + decimal amount + past start/end window. Modes cannot be mixed. Ambiguous transfers/multiple matches, missing or pending transactions, non-native-USDC logs, reorgs, stale OFAC/RPC data and provider failures return no result. Maximum90day search window and bounded RPC work.

The JSON envelope includes payer/payee, decimal/atomic amount, UTC time, canonical block/hash, transaction/log index, L2 confirmations and current public OFAC address-match flags. Its Ed25519 JWS attests to the exact observation hash, not invoice ownership, commercial purpose, irreversible finality or future sanctions status. Download `receipt.html` from the default store for private printing; retain the original JSON for signature verification at the free [verification endpoint](https://api.spendpreflight.com/v1/books/verify) and [public keys](https://api.spendpreflight.com/.well-known/spendpreflight-keys.json).

## Limits and sources

Informational, **not legal or tax advice**, a compliance certification, investment advice or safety guarantee. OFAC non-match is not clearance. No custody, signing, transaction submission or funds movement. Verify evidence before acting. Chain reads stay on our existing Infura Base RPC with bounded caching/backoff; no new provider or secret copying. [Official Circle native USDC addresses](https://developers.circle.com/stablecoins/usdc-contract-addresses) · [OFAC public list](https://ofac.treasury.gov/sanctions-list-service) · [x402 documentation](https://docs.cdp.coinbase.com/x402/welcome).

## Development acceptance

CI may add `_self_test: true` to the valid public/synthetic example. This runs only the platform wrapper startup, INPUT deletion and a SELFTEST metadata receipt in the default store. It produces no product result, target probe, chain read or billable event. Such owner tests are excluded from adoption/revenue, and are not proof of a live product lookup. Normal runs omit this flag.
