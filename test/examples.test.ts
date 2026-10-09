import { describe, it, expect, vi } from "vitest";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { createPreflightTool } from "../examples/vercel-ai-sdk";
import { createCheckPayeeTool } from "../examples/langchain";
import { createGuardedFetch } from "../examples/x402-fetch";

const challenge = {
  x402Version: 2,
  resource: { url: "https://merchant.example/data", description: "", mimeType: "application/json" },
  accepts: [{ scheme: "exact", network: "eip155:8453", amount: "5000000", asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", payTo: "0x1111111111111111111111111111111111111111", maxTimeoutSeconds: 60, extra: { name: "USD Coin", version: "2" } }],
};
const preflightInput = { challenge, resource_url: challenge.resource.url, rules: { max_per_payment_usd: 1, hold_above_usd: 0.25 } };

describe("framework examples", () => {
  it.each(["allow", "hold", "block"])("Vercel tool posts exact inputs and preserves %s with receipt", async decision => {
    const transport = vi.fn(async () => Response.json({ decision, reasons: [decision], receipt: { id: "test-receipt" } }));
    const example = createPreflightTool(transport as typeof fetch);
    const result = await example.execute!(preflightInput, { toolCallId: "test", messages: [] });
    expect(result).toMatchObject({ decision, receipt: { id: "test-receipt" } });
    expect(transport).toHaveBeenCalledTimes(1);
    expect(transport.mock.calls[0][0]).toBe("https://api.spendpreflight.com/v1/preflight");
    const init = transport.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual(preflightInput);
  });

  it.each([402, 503])("Vercel tool refuses HTTP %s without treating it as allow", async status => {
    const example = createPreflightTool(vi.fn(async () => new Response("", { status })) as typeof fetch);
    await expect(example.execute!(preflightInput, { toolCallId: "test", messages: [] })).rejects.toThrow("do not pay");
  });

  it("LangChain check_payee encodes merchant input and returns the screening result", async () => {
    const transport = vi.fn(async () => Response.json({ risk: "high", flags: ["possible_sdn_name_match"] }));
    const example = createCheckPayeeTool(transport as typeof fetch);
    const result = await example.invoke({ name: "Acme & Sons", domain: "merchant.example" });
    expect(JSON.parse(result)).toMatchObject({ risk: "high" });
    const url = transport.mock.calls[0][0] as URL;
    expect(url.origin).toBe("https://api.spendpreflight.com");
    expect(url.searchParams.get("name")).toBe("Acme & Sons");
    expect(url.searchParams.get("domain")).toBe("merchant.example");
  });

  it("LangChain rejects empty inputs before making a request", async () => {
    const transport = vi.fn();
    await expect(createCheckPayeeTool(transport as typeof fetch).invoke({})).rejects.toThrow();
    expect(transport).not.toHaveBeenCalled();
  });

  it("LangChain refuses an unavailable screen", async () => {
    const example = createCheckPayeeTool(vi.fn(async () => new Response("", { status: 503 })) as typeof fetch);
    await expect(example.invoke({ name: "Acme" })).rejects.toThrow("do not assume low risk");
  });

  it("guarded fetch refuses a costly 402 before signing or a paid retry", async () => {
    const signer = privateKeyToAccount(generatePrivateKey());
    const sign = vi.spyOn(signer, "signTypedData");
    const transport = vi.fn(async () => new Response("", {
      status: 402,
      headers: { "PAYMENT-REQUIRED": Buffer.from(JSON.stringify(challenge)).toString("base64") },
    }));
    const pay = createGuardedFetch(signer, transport as typeof fetch);
    await expect(pay(challenge.resource.url)).rejects.toThrow();
    expect(transport).toHaveBeenCalledTimes(1);
    expect(sign).not.toHaveBeenCalled();
  });
});
