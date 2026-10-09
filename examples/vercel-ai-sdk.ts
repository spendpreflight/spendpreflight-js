import { tool } from "ai";
import { z } from "zod";

// Maintained by SpendPreflight's operator. The supplied fetch pays only the $0.02
// screening fee; this tool never pays the merchant whose challenge is reviewed.
export function createPreflightTool(screeningFetch: typeof fetch) {
  return tool({
    description: "Operated by SpendPreflight. Before an x402 payment, review its 402 challenge against your spending rules ($0.02 in Base USDC). Returns allow/hold/block and a receipt; informational screening, not a compliance certification. A separate payment action must deny hold/block.",
    inputSchema: z.object({
      challenge: z.record(z.string(), z.unknown()).describe("The merchant's complete x402 402 challenge"),
      resource_url: z.url().describe("The merchant URL you plan to pay"),
      rules: z.object({
        max_per_payment_usd: z.number().positive(),
        hold_above_usd: z.number().nonnegative(),
      }),
    }),
    execute: async (input) => {
      const response = await screeningFetch("https://api.spendpreflight.com/v1/preflight", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
        signal: AbortSignal.timeout(8_000),
      });
      if (!response.ok) throw new Error(`Preflight unavailable (HTTP ${response.status}); do not pay`);
      return z.object({
        decision: z.enum(["allow", "hold", "block"]),
        reasons: z.array(z.string()),
        receipt: z.object({ id: z.string() }).passthrough(),
      }).passthrough().parse(await response.json());
    },
  });
}

// With an existing x402-paying fetch:
// const tools = { preflight_before_paying: createPreflightTool(pay) };
// Pass tools to generateText/streamText. Enforce decisions in the payment path,
// e.g. with guard() as in x402-fetch.ts; tool selection alone is not enforcement.
