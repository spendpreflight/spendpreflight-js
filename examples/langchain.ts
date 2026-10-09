import { tool } from "@langchain/core/tools";
import { z } from "zod";

// HTTP equivalent of the published MCP check_payee tool. Inject the agent's
// existing x402-paying fetch; no SpendPreflight account or API key is needed.
export function createCheckPayeeTool(screeningFetch: typeof fetch) {
  return tool(async (input) => {
    const url = new URL("https://api.spendpreflight.com/v1/check");
    for (const [key, value] of Object.entries(input)) {
      if (value) url.searchParams.set(key, value);
    }
    const response = await screeningFetch(url, { signal: AbortSignal.timeout(8_000) });
    if (!response.ok) throw new Error(`Payee screening unavailable (HTTP ${response.status}); do not assume low risk`);
    return JSON.stringify(await response.json());
  }, {
    name: "check_payee",
    description: "Operated by SpendPreflight. Screen a merchant wallet/name against OFAC SDN and check domain age/DNS before paying. Costs $0.01 in Base USDC. Informational screening, not a compliance certification; this tool does not pay the merchant.",
    schema: z.object({
      address: z.string().regex(/^0x[0-9a-fA-F]{40}$/).optional(),
      name: z.string().min(1).max(200).optional(),
      domain: z.string().min(1).max(253).optional(),
    }).refine(input => Boolean(input.address || input.name || input.domain), "Supply address, name or domain"),
  });
}

// const tools = [createCheckPayeeTool(pay)];
// Pass tools to your LangChain agent. A check result is evidence for your policy;
// enforce the policy in the payment client, rather than relying on the model.
