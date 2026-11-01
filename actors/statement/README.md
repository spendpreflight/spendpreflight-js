# USDC Wallet Statement Export — Base

SpendPreflight — trust and verification tools for stablecoin payments, built for AI agents and the people who run them.

Operated by SpendPreflight. Read-only native Base USDC JSON/CSV in/out/self transfers with reconciled opening/closing and running balances, counterparties and OFAC flags. This Actor wraps the existing deployed engine. No wallet or USDC payment is required for this USD channel.

## Input example

```json
{
  "address": "0xBf4164e07552e4c1b1B1597E72C7acAA3F0a1c58",
  "start": "2026-10-22T00:00:00Z",
  "end": "2026-10-23T00:00:00Z"
}
```

Examples are illustrative public/synthetic values, not verified payments or live results. Use your own public input. Unknown fields, malformed addresses/hashes, unsafe URLs and excessive date ranges fail before a chargeable result.

## Pricing

**$0.05 per completed result** (`statement-created`), no startup event. Set max total charge per run. A result is charged once, independently of transfer count. Platform/post-run storage charges and discounts are controlled by Apify; check the Store pricing panel. Owner tests/free-plan runs do not establish revenue. No automatic retry after ambiguous billing/output failure.

## Privacy and permissions

Limited permissions. No owner token or Infura credential is embedded in Actor source; the Actions deployment secret never enters the runtime. Only a live run ID, one-use nonce and requested public inputs go to SpendPreflight. A digest served from the live Apify container binds the request to the official tagged build; no Apify API token is sent to SpendPreflight.

The Actor removes its default run INPUT after reading and never logs query/result values. SpendPreflight processes the request transiently. No new database, bucket, dataset or request queue is created by our wrapper. **Apify retains requested results in the user's default run dataset and default key-value store, plus run metadata and any saved tasks under its own retention policy.** Do not submit private data or assume platform-wide zero retention. Existing Lint/Guard robots/pacing/CDP observation metadata and public chain metadata caches keep their already disclosed retention; no raw request bodies are stored. [Product privacy](https://spendpreflight.com/privacy/) · [Live service status](https://status.spendpreflight.com/)

## Scope and output

One public Base address; ISO date range of at most90days with inclusive start/exclusive end, not in the future. Native Circle USDC Transfer logs only, not bridged USDbC, other tokens or off-chain records. Limits:1000transfers,128RPCcalls,25seconds. Reads start with Infura, then fixed Base public and recent-only PublicNode fallbacks. Free dRPC metadata reads are a final fallback; its paid-only log methods are skipped. Infura log windows are at most10000blocks and shrink on provider range-limit errors. Public fallback windows are at most1000blocks. Cold metadata reads are paced at least250ms apart and log reads650ms apart per provider within a request; these are conservative operator limits, not provider guarantees. HTTP503 is retried twice with bounded backoff inside the same overall budget;429 cooldowns are respected. A partially reachable range returns `complete:false`, exact covered/missing block windows, a clear partial-coverage message and null running balances. Missing activity is unknown. No completed-statement event is charged for partial results. Zero reachable coverage, failed reconciliation, invalid chain evidence or stale OFAC data still fails.

JSON includes opening/closing balances, in/out/self transfers, exact decimal and atomic values, running balances, counterparties, UTC timestamps and OFAC address-match flags. `statement.csv` is available from the default run store. CSV counts as the same single export event, not an extra charge. Completeness is bounded RPC retrieval plus opening/closing balance reconciliation, not an independent cryptographic proof.

## Limits and sources

Informational, **not legal or tax advice**, a compliance certification, investment advice or safety guarantee. OFAC non-match is not clearance. No custody, signing, transaction submission or funds movement. Verify evidence before acting. Statement reads use Infura first, then fixed public Base, PublicNode and free dRPC metadata endpoints with bounded retries and no credential copying. Requested public addresses/block bounds/read-only calldata can reach these providers under their own privacy/retention policies. Only public chain metadata is cached; no address/result cache is added. [Official Circle native USDC addresses](https://developers.circle.com/stablecoins/usdc-contract-addresses) · [OFAC public list](https://ofac.treasury.gov/sanctions-list-service) · [x402 documentation](https://docs.cdp.coinbase.com/x402/welcome).

## Development acceptance

CI may add `_self_test: true` to the valid public/synthetic example. This runs only the platform wrapper startup, INPUT deletion and a SELFTEST metadata receipt in the default store. It produces no product result, target probe, chain read or billable event. Such owner tests are excluded from adoption/revenue, and are not proof of a live product lookup. Normal runs omit this flag.

## Private-run channel authentication

An Actor-specific application signing key is encrypted in the Actor's private runtime settings and excluded from builds and public source. Only a signature over the public run/build identity, short-lived timestamp, requested-input digest and one-use nonce is sent to SpendPreflight. The backend holds the public key and checks the current official build and live proof endpoint. Customer runs, output stores and logs keep their existing access restrictions. No owner/customer Apify API token or RPC credential is forwarded. CI authorization checks produce only a SELFTEST receipt, no product lookup or chargeable event.
