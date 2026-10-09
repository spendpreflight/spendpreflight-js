import { x402Client } from "@x402/core/client";
import { wrapFetchWithPayment } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { guard, type GuardOptions } from "spendpreflight";

// Inject your existing signer; never put a real key in this example or its tests.
export function createGuardedFetch(
  signer: ConstructorParameters<typeof ExactEvmScheme>[0],
  transport: typeof fetch = fetch,
  options: GuardOptions = {},
) {
  const client = new x402Client().register("eip155:8453", new ExactEvmScheme(signer));
  guard(client, {
    rules: { maxPerPaymentUsd: 1, holdAboveUsd: 0.25, dailyCapUsd: 20 },
    remote: false, // Free local rules. Holds and blocks abort before signing.
    ...options,
  });
  return wrapFetchWithPayment(transport, client);
}

// const pay = createGuardedFetch(existingSigner);
// const response = await pay("https://api.your-approved-merchant.example/data");
// Optional remote screening costs $0.02 per review; see the package README for
// guard(client, { remote: { fetch: pay } }). Shared trial: 3/day/IP, HTTP + MCP.
