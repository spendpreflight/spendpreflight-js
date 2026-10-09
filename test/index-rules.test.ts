import { describe, it, expect, vi } from "vitest";
import { guard, evaluateLocal, type HookableClient } from "../src/index";

const req = { scheme: "exact", network: "eip155:8453", asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", amount: "10000", payTo: "0x1111111111111111111111111111111111111111" };
const ctx = () => ({ selectedRequirements: req, paymentRequired: { x402Version: 2, resource: { url: "https://merchant.com/data" }, accepts: [req] } });
function client() {
  let hook: (context: any) => Promise<any>;
  const c: HookableClient = { onBeforePaymentCreation: h => { hook = h; } };
  return { c, run: () => hook(ctx()) };
}
describe("remote endpoint index rules", () => {
  it("sends the documented defaults to remote preflight, before any payment signing", async () => {
    const fake = client(); const remote = vi.fn(async (_url: any, init: any) => {
      expect(JSON.parse(init.body).rules).toMatchObject({ max_price_multiple: 5, require_live: true, hold_on_payto_change: true });
      return Response.json({ decision: "hold", reasons: ["hold: endpoint_failed_last_3"], index_evidence: { status: "available" } });
    });
    const onDecision = vi.fn(); guard(fake.c, { remote: { fetch: remote as any }, onDecision });
    expect(await fake.run()).toMatchObject({ abort: true, reason: expect.stringContaining("endpoint_failed_last_3") });
    expect(onDecision.mock.calls[0][0].remote.index_evidence.status).toBe("available");
  });
  it("preserves configurable disabling values instead of replacing false/null with defaults", async () => {
    const fake = client(); const remote = vi.fn(async (_url: any, init: any) => {
      expect(JSON.parse(init.body).rules).toMatchObject({ max_price_multiple: null, require_live: false, hold_on_payto_change: false });
      return Response.json({ decision: "allow", reasons: ["allow: all rules passed"] });
    });
    guard(fake.c, { rules: { maxPriceMultiple: null, requireLive: false, holdOnPayToChange: false }, remote: { fetch: remote as any } });
    expect(await fake.run()).toBeUndefined(); expect(remote).toHaveBeenCalledTimes(1);
  });
  it("does not invent local index evidence or make a request when remote is disabled", async () => {
    const fake = client(); guard(fake.c, { remote: false, rules: { maxPriceMultiple: .001, requireLive: true } });
    expect(await fake.run()).toBeUndefined(); expect(evaluateLocal(req, "https://merchant.com/data", { maxPriceMultiple: .001 }).decision).toBe("allow");
  });
});
