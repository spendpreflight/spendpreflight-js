import { RunContext } from "@openai/agents";
import { describe, it, expect, vi } from "vitest";
import { createAgentsPreflightTool } from "../examples/openai-agents";

const input = { challenge_json: '{"x402Version":2,"accepts":[]}', resource_url: "https://merchant.com/data", max_per_payment_usd: .5, hold_above_usd: .1 };
describe("OpenAI Agents preflight example", () => {
  it("invokes the actual SDK tool, preserving a hold and its receipt", async () => {
    const request = vi.fn(async (_url: unknown, init?: RequestInit) => {
      expect(JSON.parse(String(init?.body))).toMatchObject({ challenge: { x402Version: 2 }, rules: { max_per_payment_usd: .5 } });
      return Response.json({ decision: "hold", reasons: ["hold: policy"], receipt: { id: "fixture" } });
    });
    const t = createAgentsPreflightTool(request); expect(t.description).toContain("Operated by SpendPreflight"); expect(request).not.toHaveBeenCalled();
    expect(await t.invoke(new RunContext({}), JSON.stringify(input))).toMatchObject({ decision: "hold", receipt: { id: "fixture" } });
    expect(request.mock.calls[0][0]).toBe("https://api.spendpreflight.com/v1/preflight"); expect(request).toHaveBeenCalledTimes(1);
  });
  it("propagates screening HTTP failures and malformed decisions without approving payment", async () => {
    for (const response of [new Response("", { status: 503 }), Response.json({ decision: "go ahead" })]) {
      const request = vi.fn(async () => response);
      await expect(createAgentsPreflightTool(request).invoke(new RunContext({}), JSON.stringify(input))).rejects.toThrow(); expect(request).toHaveBeenCalledTimes(1);
    }
  });
  it("rejects malformed challenge JSON before requesting screening", async () => {
    const request = vi.fn(async () => Response.json({}));
    await expect(createAgentsPreflightTool(request).invoke(new RunContext({}), JSON.stringify({ ...input, challenge_json: "not json" }))).rejects.toThrow(); expect(request).not.toHaveBeenCalled();
  });
});
