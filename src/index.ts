import { AsyncLocalStorage } from "node:async_hooks";
export { verifyReceipt, type ReceiptVerification, type ReceiptVerificationOptions } from "./receipt-verifier.js";
/**
 * spendpreflight: allow / hold / block every x402 payment before your agent pays.
 *
 * Local rules are free and run in-process. Optionally, each payment is also sent to the
 * SpendPreflight API (https://api.spendpreflight.com) for OFAC sanctions screening of the
 * payee and a new-domain check, paid per call over x402 or via the free trial.
 *
 * Read-only: this package never signs or moves funds itself. It only aborts payments.
 */

export type Decision = "allow" | "hold" | "block";

export interface Rules {
  /** Block any single payment above this (USD). Default 1. */
  maxPerPaymentUsd?: number;
  /** Hold (ask onHold) above this (USD). Default 0.25. */
  holdAboveUsd?: number;
  /** Block once in-process spend for the current UTC day would exceed this (USD). Default 25. */
  dailyCapUsd?: number;
  /** CAIP-2 networks allowed. Default Base mainnet. */
  allowedNetworks?: string[];
  /** Only allow known USDC contracts. Default true. */
  usdcOnly?: boolean;
  domainAllowlist?: string[];
  domainBlocklist?: string[];
  payToAllowlist?: string[];
  payToBlocklist?: string[];
  /** Hold anything not on an allowlist. Default false. */
  strictAllowlist?: boolean;
  /** Remote only: hold above this category price multiple. Default 5; null disables. */
  maxPriceMultiple?: number | null;
  /** Remote only: hold after three usable failed unpaid probes. Default true. */
  requireLive?: boolean;
  /** Remote only: hold for an observed payTo change within seven days. Default true. */
  holdOnPayToChange?: boolean;
}

export interface Verdict {
  decision: Decision;
  reasons: string[];
  amountUsd: number | null;
  payTo: string;
  network: string;
  resource: string | null;
  remote?: unknown;
  receiptId?: string;
}

export interface RemoteOptions {
  /** API base. Default https://api.spendpreflight.com */
  url?: string;
  /**
   * A fetch that can pay x402 (e.g. wrapFetchWithPayment(fetch, client)). Calls to the
   * screening endpoint require a SEPARATE, locally guarded x402 client. A recursive
   * use of this same guard is rejected before signing; no hostname bypass exists.
   */
  fetch?: typeof fetch;
  /** Use the free trial (3 calls/day per IP) with plain fetch instead of paying. */
  trial?: boolean;
  /** If the remote check fails or times out: "allow" (fail-open) or "hold". Default "hold". */
  onError?: "allow" | "hold";
  timeoutMs?: number;
}

export interface GuardOptions {
  rules?: Rules;
  remote?: RemoteOptions | false;
  /** Called for "hold". Return true to approve. Default: deny. */
  onHold?: (v: Verdict) => boolean | Promise<boolean>;
  /** Called for every decision; log it. */
  onDecision?: (v: Verdict) => void | Promise<void>;
  /** For tests. */
  now?: () => number;
}

/** Minimal shape of the @x402/core client we hook into. */
export interface HookableClient {
  onBeforePaymentCreation(hook: (ctx: any) => Promise<void | { abort: true; reason: string }>): unknown;
  onAfterPaymentCreation?(hook: (ctx: any) => Promise<void>): unknown;
}

export const DEFAULT_API = "https://api.spendpreflight.com";

export const DEFAULT_RULES: Required<Rules> = {
  maxPerPaymentUsd: 1,
  holdAboveUsd: 0.25,
  dailyCapUsd: 25,
  allowedNetworks: ["eip155:8453"],
  usdcOnly: true,
  domainAllowlist: [],
  domainBlocklist: [],
  payToAllowlist: [],
  payToBlocklist: [],
  strictAllowlist: false,
  maxPriceMultiple: 5,
  requireLive: true,
  holdOnPayToChange: true,
};

// Known USDC deployments -> decimals (EVM lowercased).
export const USDC: Record<string, number> = {
  "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913": 6, // Base
  "0x036cbd53842c5426634e7929541ec2318f3dcf7e": 6, // Base Sepolia
  "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48": 6, // Ethereum
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v": 6, // Solana (case-sensitive)
};

const rank: Record<Decision, number> = { allow: 0, hold: 1, block: 2 };
const worst = (a: Decision, b: Decision): Decision => (rank[a] >= rank[b] ? a : b);

function hostOf(u: string | null | undefined): string | null {
  if (!u) return null;
  try { return new URL(u).hostname.toLowerCase().replace(/^www\./, ""); } catch { return null; }
}
function onDomainList(host: string | null, list: string[]) {
  if (!host) return false;
  return list.some(d => { const c = d.toLowerCase().replace(/^www\./, ""); return host === c || host.endsWith("." + c); });
}
const addressKey = (v: string) => /^0x[0-9a-fA-F]{40}$/.test(v) ? v.toLowerCase() : v;
const onList = (v: string, list: string[]) => list.some(x => addressKey(x) === addressKey(v));
const networks: Record<string,string> = { base: "eip155:8453", "base-sepolia": "eip155:84532", ethereum: "eip155:1", solana: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp" };
const assets: Record<string,string> = { "eip155:8453":"0x833589fcd6edb6e08f4c7c32d4f71b54bda02913", "eip155:84532":"0x036cbd53842c5426634e7929541ec2318f3dcf7e", "eip155:1":"0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48", "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp":"EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" };
const chain = (s: string) => networks[s] ?? s;
const knownUsdc = (network: string, asset: string) => assets[chain(network)] === addressKey(asset);
function validRules(r: Required<Rules>, spent: number): boolean {
  for (const v of [r.maxPerPaymentUsd,r.dailyCapUsd]) if (!Number.isFinite(v) || v <= 0 || v*1e6 > Number.MAX_SAFE_INTEGER) return false;
  if (!Number.isFinite(r.holdAboveUsd) || r.holdAboveUsd < 0 || r.holdAboveUsd*1e6 > Number.MAX_SAFE_INTEGER || !Number.isFinite(spent) || spent < 0 || spent*1e6 > Number.MAX_SAFE_INTEGER) return false;
  if (r.maxPriceMultiple !== null && (!Number.isFinite(r.maxPriceMultiple) || r.maxPriceMultiple <= 0)) return false;
  for (const v of [r.usdcOnly,r.strictAllowlist,r.requireLive,r.holdOnPayToChange]) if (typeof v !== "boolean") return false;
  return [r.allowedNetworks,r.domainAllowlist,r.domainBlocklist,r.payToAllowlist,r.payToBlocklist].every(a=>Array.isArray(a)&&a.length<=100&&a.every(v=>typeof v==="string"&&v.length>0&&v.length<=2048));
}
const budgetAtomic = (usd: number) => BigInt(Math.floor(usd*1e6));

/** Pure local evaluation of one selected payment requirement. */
export function evaluateLocal(
  req: { scheme?: string; network?: string; asset?: string; amount?: string; maxAmountRequired?: string; payTo?: string; resource?: string },
  resourceUrl: string | null,
  rules: Rules = {},
  spentTodayUsd = 0,
): Verdict {
  const r = { ...DEFAULT_RULES, ...rules };
  const reasons: string[] = [];
  let d: Decision = "allow";
  const f = (dd: Decision, why: string) => { reasons.push(`${dd}: ${why}`); d = worst(d, dd); };

  const network = String(req.network ?? "");
  const asset = String(req.asset ?? "");
  const payTo = String(req.payTo ?? "");
  const atomic = req.amount ?? req.maxAmountRequired;
  const validAtomic = typeof atomic === "string" && /^(0|[1-9][0-9]{0,77})$/.test(atomic) && BigInt(atomic) <= BigInt(Number.MAX_SAFE_INTEGER);
  const dec = knownUsdc(network,asset) ? 6 : undefined;
  const amountUsd = validAtomic && dec !== undefined ? Number(atomic) / 1e6 : null;
  const resource = resourceUrl ?? req.resource ?? null;
  const host = hostOf(resource);

  if (!validRules(r,spentTodayUsd)) return { decision:"block",reasons:["block: invalid spending rules or spend counter"],amountUsd,payTo,network,resource };
  if (!validAtomic) f("block","invalid atomic payment amount");
  if (req.scheme !== undefined && req.scheme !== "exact") f("block","unsupported payment scheme");
  if (chain(network).startsWith("eip155:") && !/^0x[0-9a-fA-F]{40}$/.test(payTo)) f("block","invalid EVM payTo");
  if (!r.allowedNetworks.some(n=>chain(n)===chain(network))) f("block", `network ${network} not allowed`);
  if (r.usdcOnly && dec == null) f("block", `asset ${asset} is not a known USDC contract`);
  if (amountUsd == null) f("hold", "amount could not be priced in USD");
  else {
    if (BigInt(atomic!) > budgetAtomic(r.maxPerPaymentUsd)) f("block", `amount $${amountUsd} exceeds max $${r.maxPerPaymentUsd}`);
    else if (BigInt(atomic!) > budgetAtomic(r.holdAboveUsd)) f("hold", `amount $${amountUsd} above hold threshold $${r.holdAboveUsd}`);
    if (BigInt(Math.ceil(spentTodayUsd*1e6)) + BigInt(atomic!) > budgetAtomic(r.dailyCapUsd)) f("block", `daily cap $${r.dailyCapUsd} would be exceeded (spent $${spentTodayUsd.toFixed(2)})`);
  }
  if (onDomainList(host, r.domainBlocklist)) f("block", `domain ${host} is on blocklist`);
  if (payTo && onList(payTo, r.payToBlocklist)) f("block", `payTo ${payTo} is on blocklist`);
  if (r.strictAllowlist) {
    const okDomain = onDomainList(host, r.domainAllowlist);
    const okPayTo = payTo && onList(payTo, r.payToAllowlist);
    if (!okDomain && !okPayTo) f("hold", `${host ?? payTo} is not on an allowlist`);
  }
  if (!payTo) f("hold", "payment has no payTo");

  return { decision: d, reasons: reasons.length ? reasons : ["allow: all local rules passed"], amountUsd, payTo, network, resource };
}

async function remotePreflight(paymentRequired: any, resource: string | null, rules: Rules, spentTodayUsd: number, opt: RemoteOptions) {
  const parsed = new URL(opt.url ?? DEFAULT_API);
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.search || parsed.hash) throw new Error("Invalid screening URL");
  const base = parsed.toString().replace(/\/$/, "");
  const url = `${base}/v1/preflight${opt.trial ? "?trial=1" : ""}`;
  const f = opt.trial || !opt.fetch ? fetch : opt.fetch;
  const ctl = new AbortController();
  const timeout = opt.timeoutMs ?? 8000;
  if (!Number.isFinite(timeout) || timeout < 1 || timeout > 60000) throw new Error("Invalid timeout");
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => { timer=setTimeout(()=>{ctl.abort();reject(new Error("Screening deadline exceeded"));},timeout); });
  const operation = async () => {
    const res = await f(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: ctl.signal,
      redirect: "error",
      body: JSON.stringify({
        challenge: paymentRequired,
        resource_url: resource ?? undefined,
        rules: {
          max_per_payment_usd: rules.maxPerPaymentUsd, hold_above_usd: rules.holdAboveUsd, daily_cap_usd: rules.dailyCapUsd,
          allowed_networks: rules.allowedNetworks, usdc_only: rules.usdcOnly,
          domain_allowlist: rules.domainAllowlist, domain_blocklist: rules.domainBlocklist,
          payto_allowlist: rules.payToAllowlist, payto_blocklist: rules.payToBlocklist, strict_allowlist: rules.strictAllowlist,
          max_price_multiple: rules.maxPriceMultiple, require_live: rules.requireLive, hold_on_payto_change: rules.holdOnPayToChange,
        },
        context: { spent_today_usd: spentTodayUsd },
      }),
    });
    if (!res.ok) throw new Error(`SpendPreflight HTTP ${res.status}`);
    const reader = res.body?.getReader(); if (!reader) throw new Error("Empty screening response");
    let total=0; const chunks:Uint8Array[]=[];
    try { for (;;) { const chunk=await reader.read(); if(chunk.done)break; total+=chunk.value.length; if(total>1_048_576)throw new Error("Screening response too large");chunks.push(chunk.value); } } finally { await reader.cancel().catch(()=>{}); }
    const bytes=new Uint8Array(total);let pos=0;for(const chunk of chunks){bytes.set(chunk,pos);pos+=chunk.length;}
    const result=JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(bytes));
    if (!result || !["allow","hold","block"].includes(result.decision) || !Array.isArray(result.reasons) || !result.reasons.every((r:unknown)=>typeof r==="string")) throw new Error("Invalid screening response");
    return result as { decision:Decision;reasons:string[];receipt?:{id:string} };
  };
  try { return await Promise.race([operation(),deadline]); } finally { clearTimeout(timer);ctl.abort(); }
}

/**
 * Attach the guard to an x402Client. Every payment the client is about to create is checked;
 * "block" and unapproved "hold" abort the payment before anything is signed.
 */
export function guard<C extends HookableClient>(client: C, options: GuardOptions = {}): C {
  const rules = { ...DEFAULT_RULES, ...(options.rules ?? {}) };
  const now = options.now ?? Date.now;
  const remote = options.remote === false ? false : options.remote;
  const remoteContext = new AsyncLocalStorage<boolean>();
  let day = new Date(now()).toISOString().slice(0,10), reserved = 0n;
  let queue = Promise.resolve();
  client.onBeforePaymentCreation(async (ctx:any) => {
    if (remoteContext.getStore()) return {abort:true,reason:"spendpreflight hold: recursive screening payment; use a separate locally guarded screening client"};
    const previous=queue; let release!:()=>void; queue=new Promise<void>(resolve=>{release=resolve;}); await previous;
    try {
      const today=new Date(now()).toISOString().slice(0,10);if(today>day){day=today;reserved=0n;}
      const req=ctx.selectedRequirements??{}, resource=ctx.paymentRequired?.resource?.url??req.resource??null;
      const spent=Number(reserved)/1e6, v=evaluateLocal(req,resource,rules,spent);
      if(v.decision!=="block"&&remote){
        try{
          const selected={...ctx.paymentRequired,accepts:[req]};
          if(new TextEncoder().encode(JSON.stringify(selected)).length>60000)throw new Error("Challenge too large");
          const rr=await remoteContext.run(true,()=>remotePreflight(selected,resource,rules,spent,remote));
          v.remote=rr;v.receiptId=rr.receipt?.id;
          for(const reason of rr.reasons)if(!reason.startsWith("allow"))v.reasons.push("remote "+reason);
          v.decision=worst(v.decision,rr.decision);
        }catch{
          const fallback=remote.onError==="allow"?"allow":"hold";
          v.reasons.push(fallback+": remote preflight unavailable");v.decision=worst(v.decision,fallback);
        }
      }
      let approved=v.decision==="allow";
      if(v.decision==="hold")approved=options.onHold?await options.onHold(v):false;
      await options.onDecision?.(v);
      if(!approved || v.amountUsd===null)return {abort:true,reason:"spendpreflight "+v.decision+": "+v.reasons.join("; ")};
      // Reserve BEFORE signing. Failed/abandoned signatures retain the reservation;
      // this is an in-process budget, not a settlement ledger.
      reserved+=BigInt(req.amount??req.maxAmountRequired);
    }finally{release();}
  });
  return client;
}
