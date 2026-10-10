import axios, { type AxiosInstance } from "axios";
import { x402Client } from "@x402/core/client";
import { wrapAxiosWithPayment } from "@x402/axios";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { guard, type GuardOptions } from "spendpreflight";

// Operated by SpendPreflight. Local rules are free; optional remote preflight
// costs $0.02 USDC on Base (or the shared three-call/day/IP trial).
// Inject an existing signer. This example never reads or prints wallet keys.
export function createGuardedAxios(
  signer: ConstructorParameters<typeof ExactEvmScheme>[0],
  transport: AxiosInstance = axios.create({ timeout: 15_000, maxRedirects: 0 }),
  options: GuardOptions = {},
) {
  const client = new x402Client().register("eip155:8453", new ExactEvmScheme(signer));
  guard(client, {
    rules: { maxPerPaymentUsd: 1, holdAboveUsd: 0.25, dailyCapUsd: 20 },
    remote: false,
    ...options,
  });
  return wrapAxiosWithPayment(transport, client);
}

// const pay = createGuardedAxios(existingSigner, undefined, {
//   remote: { trial: true, onError: "hold" },
// });
// await pay.get("https://your-approved-merchant.example/data");
// Trial exhaustion or an unavailable remote screen stops payment. For paid
// screening, supply a SEPARATE locally guarded fetch client via remote.fetch;
// see scout.ts. The merchant axios client does not pay its own screening fee.
// Hold/block means stop; no model tool selection substitutes for this hook.
