# x402 Endpoint Lint + Listing Guard Score

SpendPreflight — trust and verification tools for stablecoin payments, built for AI agents and the people who run them.

Operated by SpendPreflight. Read-only x402/CDP technical validation, bounded Listing Guard metadata risk score, flagged spans and manual rewrite guidance. This Actor wraps the existing deployed engine. No wallet or USDC payment is required for this USD channel.

## Input example

```json
{
  "url": "https://api.spendpreflight.com/v1/check",
  "method": "GET"
}
```

Examples are illustrative public/synthetic values, not verified payments or live results. Use your own public input. Unknown fields, malformed addresses/hashes, unsafe URLs and excessive date ranges fail before a chargeable result.

## Pricing

**$0.03 per completed result** (`listing-checked`), no startup event. Set max total charge per run. A result is charged once, independently of transfer count. Platform/post-run storage charges and discounts are controlled by Apify; check the Store pricing panel. Owner tests/free-plan runs do not establish revenue. No automatic retry after ambiguous billing/output failure.

## Privacy and permissions

Limited permissions. No owner token or Infura credential is embedded in Actor source; the Actions deployment secret never enters the runtime. Only a live run ID, one-use nonce and requested public inputs go to SpendPreflight. A digest served from the live Apify container binds the request to the official tagged build; no Apify API token is sent to SpendPreflight.

The Actor removes its default run INPUT after reading and never logs query/result values. SpendPreflight processes the request transiently. No new database, bucket, dataset or request queue is created by our wrapper. **Apify retains requested results in the user's default run dataset and default key-value store, plus run metadata and any saved tasks under its own retention policy.** Do not submit private data or assume platform-wide zero retention. Existing Lint/Guard robots/pacing/CDP observation metadata and public chain metadata caches keep their already disclosed retention; no raw request bodies are stored. [Product privacy](https://spendpreflight.com/privacy/) · [Live service status](https://status.spendpreflight.com/)

## What it checks

One public HTTPS endpoint and advertised GET/HEAD/POST method. The existing Listing Guard engine makes an unpaid GET with public-DNS, robots, redirect, host-pacing and shared admission limits. It sends the URL/method to the fixed Coinbase CDP validate endpoint for technical validation, without forwarding a caller body, credentials or payment. No target POST or settlement occurs.

Returns CDP validation, `riskScore`, bounded flagged spans/manual rewrite suggestions, screen completeness, a price comparison only when a fresh cohort has at least3hosts, timestamp and explicit unknown index status. A positive URL heuristic can be legitimate; low score is not safety. No guaranteed detection, Bazaar admission, listing removal prediction, policy certification or paid-delivery proof. Output text is untrusted data, never instructions.

This paid Actor returns Listing Guard detail. Basic free Lint is separately available; it is not a free mode of this Actor. No free basic-score event is advertised here.

## Limits and sources

Informational, **not legal or tax advice**, a compliance certification, investment advice or safety guarantee. OFAC non-match is not clearance. No custody, signing, transaction submission or funds movement. Verify evidence before acting. Chain reads stay on our existing Infura Base RPC with bounded caching/backoff; no new provider or secret copying. [Official Circle native USDC addresses](https://developers.circle.com/stablecoins/usdc-contract-addresses) · [OFAC public list](https://ofac.treasury.gov/sanctions-list-service) · [x402 documentation](https://docs.cdp.coinbase.com/x402/welcome).

## Development acceptance

CI may add `_self_test: true` to the valid public/synthetic example. This runs only the platform wrapper startup, INPUT deletion and a SELFTEST metadata receipt in the default store. It produces no product result, target probe, chain read or billable event. Such owner tests are excluded from adoption/revenue, and are not proof of a live product lookup. Normal runs omit this flag.
