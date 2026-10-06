import { describe, it, expect, vi } from "vitest";
import { x402Client } from "@x402/core/client";
import { guard, evaluateLocal } from "../src/index";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const PAYEE = "0x1111111111111111111111111111111111111111";
const pr = (amount: string, url = "https://api.data.example/x", extra: any = {}) => ({
  x402Version: 2,
  resource: { url, description: "", mimeType: "application/json" },
  accepts: [{ scheme: "exact", network: "eip155:8453", amount, asset: USDC, payTo: PAYEE, maxTimeoutSeconds: 60, extra: { name: "USD Coin", version: "2" }, ...extra }],
});

// Real EVM scheme with a throwaway key: signing is local (EIP-3009 typed data), no RPC, no funds.
const account = privateKeyToAccount(generatePrivateKey());
const fakeScheme = new ExactEvmScheme(account);
vi.spyOn(fakeScheme, "createPaymentPayload");
const mkClient = () => new x402Client().register("eip155:8453", fakeScheme as any);

describe("evaluateLocal", () => {
  it("allows small USDC payments on Base", () => {
    expect(evaluateLocal(pr("10000").accepts[0], "https://a.example").decision).toBe("allow");
  });
  it("holds above threshold, blocks above max, blocks wrong network/asset", () => {
    expect(evaluateLocal(pr("500000").accepts[0], null).decision).toBe("hold");
    expect(evaluateLocal(pr("5000000").accepts[0], null).decision).toBe("block");
    expect(evaluateLocal({ ...pr("10000").accepts[0], network: "eip155:1" }, null).decision).toBe("block");
    expect(evaluateLocal({ ...pr("10000").accepts[0], asset: "0xdead" }, null).decision).toBe("block");
  });
  it("enforces daily cap and lists", () => {
    expect(evaluateLocal(pr("100000").accepts[0], null, {}, 24.95).decision).toBe("block");
    expect(evaluateLocal(pr("10000").accepts[0], "https://bad.example/x", { domainBlocklist: ["bad.example"] }).decision).toBe("block");
    expect(evaluateLocal(pr("10000").accepts[0], "https://x.example", { strictAllowlist: true }).decision).toBe("hold");
    expect(evaluateLocal(pr("10000").accepts[0], "https://api.ok.example", { strictAllowlist: true, domainAllowlist: ["ok.example"] }).decision).toBe("allow");
  });
});

describe("guard on a real x402Client", () => {
  it("lets allowed payments through and records decisions", async () => {
    const decisions: any[] = [];
    const c = guard(mkClient(), { remote: false, onDecision: v => { decisions.push(v); } });
    const p = await c.createPaymentPayload(pr("10000") as any);
    expect(p).toBeTruthy();
    expect(decisions[0].decision).toBe("allow");
  });
  it("aborts blocked payments before signing", async () => {
    (fakeScheme.createPaymentPayload as any).mockClear();
    // Disable core spendControls so our guard is the only line of defense in this test.
    const raw = x402Client.fromConfig({ schemes: [{ network: "eip155:8453", client: fakeScheme as any }], spendControls: false });
    const c = guard(raw, { remote: false });
    await expect(c.createPaymentPayload(pr("5000000") as any)).rejects.toThrow(/spendpreflight block/);
    expect(fakeScheme.createPaymentPayload).not.toHaveBeenCalled();
  });
  it("asks onHold for holds", async () => {
    const c1 = guard(mkClient(), { remote: false });
    await expect(c1.createPaymentPayload(pr("500000") as any)).rejects.toThrow(/hold/);
    const c2 = guard(mkClient(), { remote: false, onHold: () => true });
    await expect(c2.createPaymentPayload(pr("500000") as any)).resolves.toBeTruthy();
  });
  it("tracks daily spend across payments", async () => {
    const c = guard(mkClient(), { remote: false, rules: { dailyCapUsd: 0.025 } });
    await c.createPaymentPayload(pr("10000") as any);
    await c.createPaymentPayload(pr("10000") as any);
    await expect(c.createPaymentPayload(pr("10000") as any)).rejects.toThrow(/daily cap/);
  });
  it("uses the remote decision and never guards calls to the API itself", async () => {
    const remoteFetch = vi.fn(async () => Response.json({ decision: "block", reasons: ["block: payTo is an OFAC SDN-listed address"], receipt: { id: "r1" } }));
    const c = guard(mkClient(), { remote: { fetch: remoteFetch as any, url: "https://api.spendpreflight.com" } });
    await expect(c.createPaymentPayload(pr("10000") as any)).rejects.toThrow(/OFAC/);
    expect(remoteFetch).toHaveBeenCalledTimes(1);
    // Payment to the SpendPreflight API itself is not re-checked (no recursion).
    await expect(c.createPaymentPayload(pr("20000", "https://api.spendpreflight.com/v1/preflight") as any)).resolves.toBeTruthy();
    expect(remoteFetch).toHaveBeenCalledTimes(1);
  });
  it("holds when the remote check is unavailable (default), allows if configured fail-open", async () => {
    const bad = vi.fn(async () => new Response("", { status: 503 }));
    const c1 = guard(mkClient(), { remote: { fetch: bad as any } });
    await expect(c1.createPaymentPayload(pr("10000") as any)).rejects.toThrow(/unavailable/);
    const c2 = guard(mkClient(), { remote: { fetch: bad as any, onError: "allow" } });
    await expect(c2.createPaymentPayload(pr("10000") as any)).resolves.toBeTruthy();
  });
});
