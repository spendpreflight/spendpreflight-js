# Apify Store channel

Sanctions Screener is the first Actor. Lint, Books and Token Safety remain gated on its successful publication and Store readback. No npm version, release or registry publish is part of this channel deployment.

`Apify Store channel` is dispatch-only on tested main. The existing `APIFY_TOKEN` Actions secret stays inside that job. `preflight` reads allowlisted metadata. `sanctions-private-build` uses pinned official Apify CLI 1.10.0, captures raw output, builds the fixed Actor directory, then configures the approved $0.003 event price while keeping it private. The runner's temporary CLI auth file is not uploaded. Actor source contains no owner token or RPC key. Never run token-print commands, dump environments or add credentials to CLI arguments/URLs.

Inspect the saved deployment receipt and current Actor/build state before repeating a dispatch. Failed/ambiguous operations are not permission to create an alternate Actor. Never accept Store publishing terms, enter payout/tax data, upgrade plans or publish for free to bypass a gate. A build needs a successful run, schemas, README and the Store terms before publication. No paid third-party endpoint, USDC transfer, trial, prospect message or signup test is required.

The matching service branch implements the same existing OFAC engine behind a live run/build + one-use container digest check, not a public bypass of x402. It stores no input, run ID or output. Actor INPUT is removed after reading; Apify output/task/run retention is separate and disclosed. First operator input must be only the public synthetic zero address, at 128 MB/60 seconds with bounded event budget; record operator work separately from demand/revenue.

Read the [official publishing prerequisites](https://docs.apify.com/actors/publishing/publish), [event billing](https://docs.apify.com/actors/monetize/pay-per-event) and [limited permissions](https://docs.apify.com/actors/development/permissions). Brad controls legal agreements, payout and tax setup. Weekly runs and payouts are aggregate channel metrics in service GROWTH.md; free-plan/owner runs are not paid adoption.

## October26 private build checkpoint

SDK PR18/main1f8b785, Test40410438393 passed53SDK+3Actor tests/types/builds. CLI run40410572382 created exactly one private Actor `hNJhO0occ4FYdhUyx`, tagged build `K0KAk23e5wvWmNWcr`. Pricing was rejected HTTP400 `cannot-monetize-without-payout-billing-info`. No Store publication or paid event occurred. The public Store URL returned404. Brad payout/billing setup was requested once; do not repeat or enter it for him. Later Actors remain held.

After owner completion, use `sanctions-price-existing` with the verified expected build ID; it checks build success and identity and does not rebuild. `preflight` is read-only and records build status. The private-build stage now refuses an existing Actor, preventing a blind rebuild after the partial deployment. Inspect existing pricing first; already configured approved pricing is not written again. This does not authorize legal terms, payout data, a free publication, an alternate Actor or repeated acceptance runs.
