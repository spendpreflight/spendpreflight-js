# Crypto Address Sanctions Screener — OFAC SDN

SpendPreflight — trust and verification tools for stablecoin payments, built for AI agents and the people who run them.

Operated by SpendPreflight. Batch exact-match public crypto addresses against the same OFAC SDN address engine used by our API. No wallet, private key or USDC payment is required for this Apify channel.

## Input

```json
{"addresses":["0x0000000000000000000000000000000000000000"]}
```

Accepts 1–100 public addresses. EVM hexadecimal addresses compare without case; other address strings preserve case. This is exact address screening, with the currency label recorded by OFAC; it is not a claim that every chain, sanctioned party or indirect exposure is covered. Invalid or excessive input fails before address events are charged.

## Output and freshness

Each result contains `address`, `address_match` (OFAC entity/programs/currency label, or null), `data_as_of`, `scope` and `disclaimer`. The source snapshot is refreshed daily by our existing pipeline. `data_as_of` is the snapshot build/observation timestamp, not OFAC's legal effective date. Data older than 26 hours, missing data or an unavailable channel fails closed. No stale result is labelled clear.

Download the default dataset as JSON or CSV. The zero address above is a public synthetic example, not a customer or sanctioned entity claim. An illustrative non-match has `address_match: null`; use the actual timestamp returned by your run.

## Price

**$0.003 per delivered address observation**, using the `address-screened` event. There is no startup event. Set your run's maximum total charge; if its remaining budget is exhausted, no additional results are delivered. Apify controls platform/post-run storage charges and any discounts; check the Store pricing panel before running. Owner tests, free-plan runs and SMTP acceptance do not establish revenue.

## Privacy and permissions

Limited permissions only. No proxies, other Actors, request queues, extra stores or external account credentials. The owner deployment token is used only in GitHub Actions; it is never embedded in this Actor. The Actor passes only its live run ID, a one-use random nonce and the requested public addresses to SpendPreflight. A body digest served by its live Apify container authenticates that pending request. No Apify API token is sent to SpendPreflight.

The default run `INPUT` is removed after reading; query values/results are never logged by our code. SpendPreflight processes the request in memory without retaining bodies, run IDs, addresses or results. **Apify independently retains user-owned output datasets, run metadata, and any saved tasks under its platform retention policy.** Do not submit private data or assume platform-wide zero retention. No additional data store is created by this Actor. Output may be downloaded/deleted by the user through Apify.

## Limits

Informational screening, **not legal or tax advice**, not a compliance certification or safety guarantee. A non-match is not sanctions clearance. This tool does not assess ownership, indirect exposure, non-OFAC lists or transaction history. Verify a match against the [official OFAC source](https://ofac.treasury.gov/sanctions-list-service) before acting. No custody, signing, payment or transfer occurs. No automatic retry on ambiguous billing/output failures.

Public service [privacy](https://spendpreflight.com/privacy/) and [status history](https://status.spendpreflight.com/) apply. Questions: contact@spendpreflight.com.

## Private-run channel authentication

An Actor-specific application signing key is encrypted in the Actor's private runtime settings and excluded from builds and public source. Only a signature over the public run/build identity, short-lived timestamp, requested-input digest and one-use nonce is sent to SpendPreflight. The backend holds the public key and checks the current official build and live proof endpoint. Customer runs, output stores and logs keep their existing access restrictions. No owner/customer Apify API token or RPC credential is forwarded. CI authorization checks produce only a SELFTEST receipt, no product lookup or chargeable event.
