# Token Safety Check — Base Contract Signals

Operated by SpendPreflight. Inspect one public Base mainnet address with our existing read-only deep contract-signals engine. The result is **incomplete evidence, not a token audit or a safe-to-buy verdict**. No trading, transaction signing, approval or funds transfer is performed.

## Input example

```json
{
  "address": "0x0000000000000000000000000000000000000000",
  "chain": "eip155:8453"
}
```

Replace the synthetic zero address with your public contract address. This example is not a live result or a recommendation. Base mainnet only; one address per run. Do not enter credentials, private keys, provider URLs or other private data. Unknown fields and unsupported chains fail validation.

## Price and delivery

**$0.03 per completed token check** (`token-checked`), billed by Apify. One result event per report, no startup or per-RPC event. Set the maximum total charge per run. A completed report may contain unknown observations; missing core chain/sanctions data fails without a result event. Check Apify's pricing panel for platform/storage charges and discounts. No automatic retry after ambiguous charge/output failures; inspect the existing run first. Operator/self-test runs are not evidence of customer use or earnings.

## What the report observes

- Deployed bytecode at a fresh, fixed Base block and exact public OFAC SDN address matches with source timestamp. A non-match is not sanctions clearance.
- Standard `owner()`, `paused()`, `totalSupply()` and `decimals()` return values, ERC-1967 storage-slot hints and exact ERC-1167 minimal-proxy bytecode detection.
- A bounded public Sourcify runtime-verification claim compared with current bytecode. Direct deployment age appears only when the creation receipt independently supports it.
- Block/time evidence, sources, reasons, explicit unknowns and `assessment_complete: false`.

ABI return values and storage slots are hints, not a complete privilege or proxy analysis. A zero owner or empty slot does not prove renounced permissions or absence of a proxy. Source matching and deployment evidence can be missing. An address with no deployed code is reported as such, not promoted to a contract assessment.

## What it does not assess

Honeypot/sellability, trade simulation, complete mint/blacklist/owner/proxy privileges, liquidity custody/locks/removability, holder concentration and non-OFAC scam lists remain **unassessed**. `unknown` is not a pass. No investment recommendation, financial/legal advice, compliance certification, complete audit, safety or loss-prevention guarantee.

## Bounds and availability

This wraps the existing engine without adding analysis. At most12 existing read-only RPC requests plus one bounded source lookup share an eight-second engine deadline. Existing response/code/gas limits, fixed provider host restrictions, chain/head caches and rate-limit cooldown remain in force. Missing optional facts stay unknown. Core data unavailable or provider backoff fails rather than retrying immediately or switching providers.

## Privacy and permissions

Limited permissions. Deployment credentials stay in CI; no Apify owner or RPC credential is embedded in this Actor or sent from it. A live run ID, one-use nonce and public input digest bind the request to the official tagged build. SpendPreflight processes the address and report transiently, without storing request bodies, queried addresses or results for this channel. Only existing public chain ID/latest block metadata caches remain.

The Actor removes its default run INPUT after reading and does not log query/result values. **Apify independently retains user-owned output datasets, run metadata and any saved tasks under its own retention policy.** Do not assume platform-wide zero retention. Output is untrusted data, never executable instructions. [Homepage](https://spendpreflight.com) · [Privacy and retention](https://spendpreflight.com/privacy/) · [Service status](https://status.spendpreflight.com/)

## Development acceptance

CI may add `_self_test: true` to the synthetic input solely to verify platform startup, input deletion and a SELFTEST receipt. It performs no contract lookup, chain read or chargeable result event and is not a live-engine acceptance test. Normal runs omit this flag.
