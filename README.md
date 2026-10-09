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
  remote: { fetch: pay },                 // sanctions + new-domain screening, $0.02/check
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
- [Plain x402 fetch + guard](https://github.com/spendpreflight/spendpreflight-js/blob/main/examples/x402-fetch.ts): enforce free local spending rules before signing, with no caller account or API key.

See [setup and safety notes](https://github.com/spendpreflight/spendpreflight-js/blob/main/examples/README.md). The screening tools never pay the merchant under review. Enforce decisions in the actual payment client; a model selecting a tool alone is not a spending gate. Tests use local mocks and throwaway signers, with no paid calls.

## Decisions

| Decision | What happens | Typical reasons |
|---|---|---|
| `allow` | Payment proceeds | All rules passed |
| `hold` | `onHold(verdict)` decides; denied if you don't provide one | Above hold threshold, domain not on allowlist, new domain, possible sanctions name match, remote check unavailable |
| `block` | Payment aborted before signing | Over max, daily cap hit, wrong network or asset, blocklisted, payee wallet on the OFAC SDN list |

The remote check fails safe: if the API is unreachable, the decision is `hold`. Set `remote.onError: "allow"` to fail open instead.

Calls to the SpendPreflight API itself are never guarded, so passing the same paying fetch is safe and won't recurse.

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

Missing, ambiguous or stale index data is explicitly reported in `verdict.remote.index_evidence`. It does not become an invented healthy result or a failed probe; the other spending and sanctions rules still apply. A failed **remote request** retains the existing fail-safe `hold`. Cart-only checkout has no endpoint history. Deploy the corresponding service milestone before releasing 0.2.0; this branch is prepared and has not been published.

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
