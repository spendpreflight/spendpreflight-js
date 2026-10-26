# Owner decision: three paid Apify products

This October26 direct owner decision supersedes the older four-Actor plan and prices. The previous sanctions Actor remains private and untouched; it is not a prerequisite for these three products.

| Actor | Event USD | Corresponding x402 USD | After Apify20% share, before platform costs |
|---|---:|---:|---:|
| x402 Endpoint Lint + Listing Guard score | 0.065 | Guard0.05; basic Lint stays free | 0.052 |
| USDC Payment Receipt (Base) | 0.013 | 0.01 | 0.0104 |
| USDC Wallet Statement Export (Base) | 0.065 | 0.05 | 0.052 |

No x402 price changes, wallet/custody/payment signing, third-party payments, new data stores or request-body retention. README files disclose Apify's separate retention of the user's default output stores/tasks/run metadata. A scoped live-container nonce/digest authenticates the existing service engines without copying any token, RPC key or receipt signing key to Actor source. Old private sanctions build/receipt are preserved.

## Deployment and resume

Use dispatch-only `apify-paid-products.yml` on green tested main. The existing SDK `APIFY_TOKEN` Actions secret stays inside CI. Official pinned CLI uploads only fixed staged source files, never a repository, environment dump or token argument. `build` refuses existing Actors and saves exact build/run IDs before pricing attempts. The explicit synthetic platform self-test returns only SELFTEST metadata, deletes INPUT and performs no actual lookup or billable event. It proves wrapper/platform startup, not live product delivery.

`inspect` is read-only. `configure`/`publish` require a JSON map of exact saved build IDs, successful builds, approved event pricing/no extra paid events, and a successful run of that exact build. Publication must be verified with `isPublic:true` and a successful public Store readback. Never accept legal terms, change payout/tax data, create alternate Actors, retry ambiguous operations or publish free to bypass a monetization gate. Payout setup remains Brad's; its prior missing-info question has already been asked once.

## Weekly GROWTH reporting

Use the same existing two-hour heartbeat; first weekly checkpoint Nov2UTC, then7days. After inspecting the dated once-only journal, dispatch `product=all, phase=inspect` once. Download the allowlisted artifact and append one dated GROWTH row per product: visibility/build, lifetime runs,7day active users (including owner),30day public non-owner run statuses, and verified payout USD or **unknown**. These are different windows, not weekly unique customers. Platform self-test runs are operator work; do not infer demand or revenue. A configured event price or run count is not a payout. Supported Actor metadata does not expose payouts, so keep them unknown until a verified owner-provided aggregate is available; never read/change payout/tax settings or guess private endpoints.
