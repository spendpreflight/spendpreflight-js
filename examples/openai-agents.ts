import { tool } from "@openai/agents";
import { z } from "zod";

// Maintained by SpendPreflight's operator. Only the separate $0.02 screening fee
// can be paid by the injected fetch. No merchant request or wallet method is used.
export function createAgentsPreflightTool(screeningFetch: typeof fetch) {
  return tool({
    name: "spendpreflight_before_paying",
    description: "Operated by SpendPreflight. Review an x402 challenge before paying ($0.02 screening fee in Base USDC). Returns allow/hold/block, reasons and receipt. Never pays the merchant; informational, not a compliance certification. Enforce hold/block in your payment client, not only model instructions.",
    parameters: z.object({
      challenge_json: z.string().max(60_000).describe("Complete HTTP 402 PaymentRequired body, encoded as JSON"),
      resource_url: z.url().describe("Merchant resource that returned the 402"),
      max_per_payment_usd: z.number().positive(),
      hold_above_usd: z.number().nonnegative(),
    }),
    // Propagate errors: an unavailable check must never look like an approval.
    errorFunction: null,
    execute: async ({ challenge_json, resource_url, max_per_payment_usd, hold_above_usd }) => {
      const challenge = JSON.parse(challenge_json);
      if (!challenge || typeof challenge !== "object" || Array.isArray(challenge)) throw new Error("Challenge must be a JSON object");
      const body = JSON.stringify({ challenge, resource_url, rules: { max_per_payment_usd, hold_above_usd } });
      if (new TextEncoder().encode(body).byteLength > 65_536) throw new Error("Preflight input exceeds 64 KB; not sent");
      const response = await screeningFetch("https://api.spendpreflight.com/v1/preflight", {
        method: "POST", headers: { "Content-Type": "application/json" }, body,
        redirect: "error", signal: AbortSignal.timeout(8_000),
      });
      if (!response.ok) throw new Error(`Preflight unavailable (HTTP ${response.status}); do not pay`);
      return z.object({
        decision: z.enum(["allow", "hold", "block"]), reasons: z.array(z.string()),
        receipt: z.object({ id: z.string().min(1) }).passthrough(),
      }).passthrough().parse(await response.json());
    },
  });
}

// Add createAgentsPreflightTool(pay) to your existing Agent's tools. This factory
// makes no model call and requires no extra OpenAI or SpendPreflight credentials.
// Keep guard() in the actual payment path; tool availability is not enforcement.
