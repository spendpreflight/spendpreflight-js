import { describe, it, expect, vi, afterEach } from "vitest";
import axios, { AxiosError, AxiosHeaders, type AxiosAdapter } from "axios";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { createGuardedAxios } from "../examples/x402-axios";

afterEach(() => vi.unstubAllGlobals());
const resource = "https://merchant.example/data";
function setup(amount = "10000") {
  const challenge = { x402Version: 2, resource: { url: resource, description: "fixture", mimeType: "application/json" },
    accepts: [{ scheme: "exact", network: "eip155:8453", amount,
      asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", payTo: "0x1111111111111111111111111111111111111111",
      maxTimeoutSeconds: 60, extra: { name: "USD Coin", version: "2" } }] };
  const signer = privateKeyToAccount(generatePrivateKey());
  const sign = vi.spyOn(signer, "signTypedData");
  const calls: string[] = [];
  const adapter: AxiosAdapter = async config => {
    calls.push(String(config.headers.get("PAYMENT-SIGNATURE") ?? ""));
    if (calls.length === 1) throw new AxiosError("Payment required", "ERR_BAD_REQUEST", config, undefined,
      { data: {}, status: 402, statusText: "Payment Required", config,
        headers: new AxiosHeaders({ "payment-required": Buffer.from(JSON.stringify(challenge)).toString("base64") }) });
    return { data: { fixture: true }, status: 200, statusText: "OK", config, headers: new AxiosHeaders() };
  };
  return { signer, sign, calls, transport: axios.create({ adapter }), challenge };
}

describe("axios preflight example (mock transport; no settlement)", () => {
  it.each(["500000", "5000000"])("stops hold/block quote %s before signing or retry", async amount => {
    const s = setup(amount);
    await expect(createGuardedAxios(s.signer, s.transport).get(resource)).rejects.toThrow();
    expect(s.sign).not.toHaveBeenCalled(); expect(s.calls).toEqual([""]);
  });
  it.each(["hold", "block"])("remote %s prevents merchant signing", async decision => {
    const s = setup(); const screen = vi.fn(async () => Response.json({ decision, reasons: [decision] }));
    await expect(createGuardedAxios(s.signer, s.transport, { remote: { fetch: screen, onError: "hold" } }).get(resource)).rejects.toThrow();
    expect(screen).toHaveBeenCalledTimes(1); expect(s.sign).not.toHaveBeenCalled(); expect(s.calls).toEqual([""]);
  });
  it.each([402, 503])("remote HTTP%s cannot trigger merchant retry", async status => {
    const s = setup(); const screen = vi.fn(async () => new Response("", { status }));
    vi.stubGlobal("fetch", screen);
    await expect(createGuardedAxios(s.signer, s.transport, { remote: { trial: true, onError: "hold" } }).get(resource)).rejects.toThrow();
    expect(screen).toHaveBeenCalledTimes(1); expect(s.sign).not.toHaveBeenCalled(); expect(s.calls).toEqual([""]);
  });
  it("passes an allowed quote through the real axios wrapper with one mock signed retry", async () => {
    const s = setup(); const screen = vi.fn(async () => Response.json({ decision: "allow", reasons: [] }));
    const result = await createGuardedAxios(s.signer, s.transport, { remote: { fetch: screen } }).get(resource);
    expect(result.data).toEqual({ fixture: true }); expect(screen).toHaveBeenCalledTimes(1);
    expect(s.sign).toHaveBeenCalledTimes(1); expect(s.calls).toHaveLength(2); expect(s.calls[0]).toBe(""); expect(s.calls[1]).not.toBe("");
  });
});
