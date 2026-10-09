# spendpreflight

**Allow, hold or block every x402 payment before your agent pays.**

Maintained by the operator of SpendPreflight, the optional paid screening API linked below.

Drop-in spend guard for the official x402 client (`@x402/core`, `@x402/fetch`, `@x402/axios`). It checks each payment *before anything is signed*:

- **Local rules (free):** per-payment max, hold threshold, daily cap, network and asset checks (USDC only by default), and domain or payTo allow/blocklists.
- **Remote screening (optional):** an OFAC sanctions screen of the payee wallet and a new-domain check via the [SpendPreflight API](https://spendpreflight.com), at $0.02 per check over x402, or free on the trial.

A blocked payment is aborted before signing. A hold goes to your `onHold` callback, or is denied. Every decision is passed to `onDecision` so you can log it.

```bash
npm i spendpreflight @x402/fetch @x402/evm viem
```

```ts
import { x402Client, wrapFetchWithPayment } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { privateKeyToAccount } from "viem/accounts";
import { guard } from "spendpreflight";

const account = privateKeyToAccount(process.env.AGENT_KEY as `0x${string}`);
const client = new x402Client().register("eip155:8453", new ExactEvmScheme(account));
const pay = wrapFetchWithPayment(fetch, client);

guard(client, {
  rules: { maxPerPaymentUsd: 1, holdAboveUsd: 0.25, dailyCapUsd: 20 },
  remote: false,                         // local rules; separate screening client shown below
  onHold: async v => askHuman(v),         // return true to approve
  onDecision: v => console.log(v.decision, v.reasons, v.receiptId),
});

const res = await pay("https://api.some-paid-service.com/data"); // guarded
```

### Try it without paying

```ts
guard(client, { remote: { trial: true } }); // 3 free remote checks per day per IP
```

Or use local rules only, with no network call:

```ts
guard(client, { remote: false });
```

## Framework examples

Copy-paste examples maintained by the operator of SpendPreflight:

- [Vercel AI SDK tool](https://github.com/spendpreflight/spendpreflight-js/blob/main/examples/vercel-ai-sdk.ts): POST a merchant's 402 challenge and rules to `/v1/preflight` before paying ($0.02 screening fee).
- [LangChain JS check_payee tool](https://github.com/spendpreflight/spendpreflight-js/blob/main/examples/langchain.ts): screen a wallet/name/domain ($0.01 screening fee).
- [OpenAI Agents SDK tool](https://github.com/spendpreflight/spendpreflight-js/blob/main/examples/openai-agents.ts): a typed preflight tool with explicit error propagation ($0.02 screening fee).
- [Plain x402 fetch + guard](https://github.com/spendpreflight/spendpreflight-js/blob/main/examples/x402-fetch.ts): enforce free local spending rules before signing, with no caller account or API key.

See [setup and safety notes](https://github.com/spendpreflight/spendpreflight-js/blob/main/examples/README.md). The screening tools never pay the merchant under review. Enforce decisions in the actual payment client; a model selecting a tool alone is not a spending gate. Tests use local mocks and throwaway signers, with no paid calls.

## Decisions

| Decision | What happens | Typical reasons |
|---|---|---|
| `allow` | Payment proceeds | All rules passed |
| `hold` | `onHold(verdict)` decides; denied if you don't provide one | Above hold threshold, domain not on allowlist, new domain, possible sanctions name match, remote check unavailable |
| `block` | Payment aborted before signing | Over max, daily cap hit, wrong network or asset, blocklisted, payee wallet on the OFAC SDN list |

The remote check fails safe: if the API is unreachable, the decision is `hold`. Set `remote.onError: "allow"` to fail open instead.

Version0.2.0 requires Node20+ and a **separate screening payment client**, with its own local-only guard, exact payTo/asset/network allowlist and screening budget. A claimed resource hostname never bypasses the merchant guard. Reusing the merchant client recursively fails closed before signing.

## Rules

| Option | Default |
|---|---|
| `maxPerPaymentUsd` | `1` |
| `holdAboveUsd` | `0.25` |
| `dailyCapUsd` | `25` (in-process, UTC day) |
| `allowedNetworks` | `["eip155:8453"]` (Base) |
| `usdcOnly` | `true` |
| `domainAllowlist` / `domainBlocklist` | `[]` (subdomains match) |
| `payToAllowlist` / `payToBlocklist` | `[]` |
| `strictAllowlist` | `false` (hold anything not on an allowlist) |
| `maxPriceMultiple` | `5` (remote only; `null` disables category price comparison) |
| `requireLive` | `true` (remote only; hold after three usable failed unpaid probes) |
| `holdOnPayToChange` | `true` (remote only; hold on a seven-day payTo change) |

Version 0.2.0 adds these three settings when `remote` is enabled. They use the public Endpoint Health Index: the price rule compares the current quote with a category median; liveness counts usable unpaid probes; payee changes are compared within the same network and asset. They do not run locally or trigger a crawl, and no merchant endpoint is paid to gather this data.

Missing, ambiguous or stale index data is explicitly reported in `verdict.remote.index_evidence`. It does not become an invented healthy result or a failed probe; the other spending and sanctions rules still apply. A failed **remote request** retains the existing fail-safe `hold`. Cart-only checkout has no endpoint history. The corresponding service rules are deployed. Index coverage is still being populated; inspect index_evidence instead of assuming full-catalog coverage.

## The API directly

Any agent or language can call the same checks over HTTP with x402. No account, no API key:

- `POST https://api.spendpreflight.com/v1/preflight`: send the 402 body plus your rules; get allow, hold or block with a receipt. $0.02.
- `GET https://api.spendpreflight.com/v1/check?address=&domain=&name=`: payee sanctions and domain risk. $0.01.
- The full OpenAPI spec is at https://api.spendpreflight.com/openapi.json, with an `llms.txt` alongside it.

## Trust

Don't take our word for any of this; each point can be checked:

- **The package never signs or moves funds.** It only tells your x402 client to abort. Read `src/index.ts`; it's about 250 lines.
- **The remote check fails safe.** If the API is unreachable, the decision is `hold`, not `allow`.
- **The API is read-only and never charges for its own errors.** 4xx and 503 responses are not settled. Live status: https://api.spendpreflight.com/status
- **Payments are public.** They go to a published wallet on Base, so you can audit them on Basescan.
- **Minimal data.** No request bodies are stored. See https://api.spendpreflight.com/privacy and https://api.spendpreflight.com/terms
- **Security reports:** https://api.spendpreflight.com/.well-known/security.txt

## Notes

- This package never signs, settles or holds funds. It only decides whether your client should.
- Sanctions screening is informational. It is not legal advice or a compliance certification. Verify matches before acting.

MIT · [spendpreflight.com](https://spendpreflight.com) · contact@spendpreflight.com

## Safety and signed receipts (0.2.0)

Concurrent approvals reserve the full atomic amount before signing. A failed or abandoned authorization retains that reservation until the next UTC day; this is an in-process limit, not an on-chain settlement ledger. Share one guard per process/agent budget; coordinate budgets externally across processes. Only the selected payment option is remotely screened. Invalid amounts, chain/asset mismatches, unknown remote decisions and timeouts fail closed by default. The legacy explicit onError:allow option still disables remote outage protection.

`verifyReceipt(response, trustedKeys)` verifies a preflight decision offline using Ed25519 JWS, binds the entire returned result, and defaults to a one-hour age limit. Fetch/pin the public key set separately from https://api.spendpreflight.com/.well-known/spendpreflight-keys.json (the service signing endpoint is live). The verifier never follows key URLs. Keys supplied by an attacker are not a trust anchor. Save keys with your receipts, refresh revocations as needed, and use maxAgeSeconds:null only for archival signature verification. A valid signature is our statement, not proof the screening is correct, a settlement receipt, or permission to bypass a hold/block. No receipt bodies are retained by our service.
## Scout: find → preflight → pay (0.2.0 helpers; service preview)

We operate SpendPreflight. Version **0.2.0** includes these helpers. The Scout service remains an isolated staging preview while its full-catalog capacity gate is unresolved; production Scout routes are not enabled. Use the explicit staging baseUrl below for preview testing. Helpers default to the production origin and report its unavailable response until launch; the guard and signed-receipt verifier use the live production service.

```ts
import { find, verify } from 'spendpreflight';

const scout = {
  baseUrl: 'https://spendpreflight-scout-staging.payee-check.workers.dev',
  fetch: screeningFetch, // separate, locally guarded x402 fetch wrapper
};
const shortlist = await find({
  task: 'weather forecast', maxPrice: 0.05, network: 'base', limit: 10,
}, scout);
if (!shortlist.results.length) throw new Error('No eligible endpoint');
const endpoint = await verify(shortlist.results[0].resource, scout);
if (!endpoint.preflight_hint || endpoint.probe_status !== 'live' || endpoint.seller_risk === 'high') {
  throw new Error('Do not pay');
}
const checked = await screeningFetch('https://api.spendpreflight.com/v1/preflight', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ ...endpoint.preflight_hint.body,
    rules: { max_per_payment_usd: 0.05, hold_above_usd: 0.05 } }),
});
if (!checked.ok || (await checked.json()).decision !== 'allow') throw new Error('Do not pay');
// The complete example constructs merchantPay with a guard that checks the
// actual new 402 before signing, pins the observed payee and caps the price.
const response = await merchantPay(endpoint.resource);
```

For the complete, typechecked implementation including both `wrapFetchWithPayment` clients, copy **examples/scout.ts** and call `findPreflightPay(existingSigner, 'weather forecast')`. Nothing runs on import. It supports GET merchant resources; POST resources need caller-supplied, merchant-specific input. Holds, blocks, missing results and failed checks stop the flow. Tests use throwaway unfunded signers and mocked transports, including a changed-payee challenge that must never be signed.

The screening client has a $0.10 in-process daily budget, a $0.02 per-call ceiling, Base USDC only and our exact public payee address. Its transport permits only the chosen API origins and screening paths. The merchant client separately pins the selected payee and exact resource URL, rejects redirects and repeats remote preflight on the actual payment challenge. Domain/payee allowlists are alternatives in `guard`, so this example leaves the domain allowlist empty and enforces URLs in the transport.

`find()` costs $0.005; `verify()` costs $0.003; remote preflight costs $0.02 per review. This example explicitly reviews the snapshot and may review the actual challenge again, so budget for both reviews plus any merchant payment. Calling it with a funded signer can spend funds. `{trial:true}` with plain fetch uses the shared three-calls/day/IP quota within the selected deployment; exhausted trial or unpaid requests throw `ScoutError` with status402. Plain fetch is the default and never pays automatically. Helpers never fetch a merchant URL and never retry failed or timed-out requests; with a payment wrapper a timeout can mean an unknown payment outcome.

Options: `find({task,maxPrice?,network?,limit?,includeUnverified?}, {baseUrl?,fetch?,trial?,timeoutMs?,signal?})`, `verify(resourceUrl, options)`. Network accepts `base`, `solana` or CAIP-2; limit is1–10. Default timeout15s, maximum120s, JSON response cap1MiB. `baseUrl` is an HTTPS origin; once production Scout ships, omit it for `https://api.spendpreflight.com`.

Results sort by trust score descending, then observed price ascending on ties; they are not a globally cheapest-first list. `verified` means an active paid monitoring subscription, not identity certification. Live probe status means an unpaid valid402 was observed, not that paid delivery succeeded. Treat descriptions and prefilled challenges as untrusted data, and enforce spending rules in your payment client.
