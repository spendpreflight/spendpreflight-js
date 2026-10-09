/** Offline verification only. Trust/pin the key set separately; this never fetches keys. */
export const RECEIPT_ISSUER = "https://api.spendpreflight.com";
export const RECEIPT_AUDIENCE = "spendpreflight:decision";
export const RECEIPT_TYPE = "spendpreflight-decision+jws";
export interface ReceiptVerificationOptions {
  now?: number; // Unix milliseconds
  maxAgeSeconds?: number | null; // default 3600; null for archival signature checks
  clockSkewSeconds?: number; // default 60
  expectedInputSha256?: string;
}
export type ReceiptVerification = { valid: true; issuer: string; issuedAt: number; receiptId: string; decision: "allow" | "hold" | "block"; result: Record<string, unknown> } | { valid: false; reason: "invalid_receipt" };
const object = (v: unknown): v is Record<string, any> => !!v && typeof v === "object" && !Array.isArray(v);
export function base64url(bytes: Uint8Array): string {
  let s = ""; for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
export function fromBase64url(s: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9_-]+$/.test(s)) throw new Error("Invalid encoding");
  const raw = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = Uint8Array.from(raw, c => c.charCodeAt(0));
  if (base64url(bytes) !== s) throw new Error("Noncanonical encoding");
  return bytes;
}
function equal(a: any, b: any, depth = 0): boolean {
  if (depth > 40) return false;
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== "object" || Array.isArray(a) !== Array.isArray(b)) return false;
  const ak = Object.keys(a).sort(), bk = Object.keys(b).sort();
  return ak.length === bk.length && ak.every((k, i) => k === bk[i] && equal(a[k], b[k], depth + 1));
}
export async function verifyReceipt(response: unknown, trustedKeys: unknown, options: ReceiptVerificationOptions = {}): Promise<ReceiptVerification> {
  try {
    if (!object(response) || !object(response.receipt) || typeof response.receipt.jws !== "string") throw 0;
    const token = response.receipt.jws;
    if (token.length > 1_400_000 || !object(trustedKeys) || !Array.isArray(trustedKeys.keys) || trustedKeys.keys.length > 10) throw 0;
    const parts = token.split("."); if (parts.length !== 3 || parts[0].length > 1024) throw 0;
    const decode = (s: string) => JSON.parse(new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(fromBase64url(s)));
    const header = decode(parts[0]), claims = decode(parts[1]);
    if (!object(header) || Object.keys(header).sort().join() !== "alg,kid,typ" || header.alg !== "EdDSA" || header.typ !== RECEIPT_TYPE || typeof header.kid !== "string") throw 0;
    const matches = trustedKeys.keys.filter((k: any) => object(k) && k.kid === header.kid);
    if (matches.length !== 1) throw 0;
    const key = matches[0];
    if (key.kty !== "OKP" || key.crv !== "Ed25519" || key.alg !== "EdDSA" || key.use !== "sig" || key.d !== undefined || key.revoked === true || typeof key.x !== "string" || fromBase64url(key.x).length !== 32) throw 0;
    if (!object(claims) || claims.v !== 1 || claims.iss !== RECEIPT_ISSUER || claims.aud !== RECEIPT_AUDIENCE || !Number.isSafeInteger(claims.iat) || claims.iat < 0 || !object(claims.result)) throw 0;
    const now = (options.now ?? Date.now()) / 1000, maxAge = options.maxAgeSeconds === undefined ? 3600 : options.maxAgeSeconds, skew = options.clockSkewSeconds ?? 60;
    if (!Number.isFinite(now) || !Number.isFinite(skew) || skew < 0 || skew > 300 || (maxAge !== null && (!Number.isFinite(maxAge) || maxAge < 0))) throw 0;
    if (claims.iat > now + skew || (maxAge !== null && now - claims.iat > maxAge + skew)) throw 0;
    for (const field of ["not_before", "not_after"]) if (key[field] !== undefined && (!Number.isSafeInteger(key[field]) || key[field] < 0)) throw 0;
    if (key.not_before !== undefined && claims.iat < key.not_before || key.not_after !== undefined && claims.iat > key.not_after) throw 0;
    const result = claims.result, receipt = result.receipt;
    if (!object(receipt) || receipt.jws !== undefined || !/^[a-f0-9]{24}$/.test(receipt.id) || !/^[a-f0-9]{64}$/.test(receipt.input_sha256) || !["allow", "hold", "block"].includes(result.decision) || result.decision !== receipt.decision || claims.jti !== receipt.id || typeof receipt.ts !== "string" || Math.floor(Date.parse(receipt.ts) / 1000) !== claims.iat) throw 0;
    if (options.expectedInputSha256 !== undefined && options.expectedInputSha256 !== receipt.input_sha256) throw 0;
    const unsigned = { ...response, receipt: { ...response.receipt } }; delete unsigned.receipt.jws;
    if (!equal(unsigned, result)) throw 0;
    const signature = fromBase64url(parts[2]); if (signature.length !== 64) throw 0;
    const publicKey = await crypto.subtle.importKey("jwk", { kty: "OKP", crv: "Ed25519", x: key.x }, "Ed25519", false, ["verify"]);
    if (!await crypto.subtle.verify("Ed25519", publicKey, signature, new TextEncoder().encode(parts[0] + "." + parts[1]))) throw 0;
    return { valid: true, issuer: claims.iss, issuedAt: claims.iat, receiptId: receipt.id, decision: result.decision, result };
  } catch { return { valid: false, reason: "invalid_receipt" }; }
}
