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
   * SpendPreflight API itself are never guarded, so passing the same client is safe.
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
};

// Known USDC deployments -> decimals (EVM lowercased).
export const USDC: Record<string, number> = {
  "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913": 6, // Base
  "0x036cbd53842c5426634e7929541ec2318f3dcf7e": 6, // Base Sepolia
  "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48": 6, // Ethereum
  "epjfwdd5aufqssqem2qn1xzybapc8g4wegkzwytdt1v": 6, // Solana
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
const onList = (v: string, list: string[]) => list.some(x => x.toLowerCase() === v.toLowerCase());

/** Pure local evaluation of one selected payment requirement. */
export function evaluateLocal(
  req: { network?: string; asset?: string; amount?: string; maxAmountRequired?: string; payTo?: string; resource?: string },
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
  const dec = USDC[asset.toLowerCase()];
  const amountUsd = atomic != null && dec != null ? Number(atomic) / 10 ** dec : null;
  const resource = resourceUrl ?? req.resource ?? null;
  const host = hostOf(resource);

  if (!r.allowedNetworks.includes(network)) f("block", `network ${network} not allowed`);
  if (r.usdcOnly && dec == null) f("block", `asset ${asset} is not a known USDC contract`);
  if (amountUsd == null) f("hold", "amount could not be priced in USD");
  else {
    if (amountUsd > r.maxPerPaymentUsd) f("block", `amount $${amountUsd} exceeds max $${r.maxPerPaymentUsd}`);
    else if (amountUsd > r.holdAboveUsd) f("hold", `amount $${amountUsd} above hold threshold $${r.holdAboveUsd}`);
    if (spentTodayUsd + amountUsd > r.dailyCapUsd) f("block", `daily cap $${r.dailyCapUsd} would be exceeded (spent $${spentTodayUsd.toFixed(2)})`);
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
  const base = (opt.url ?? DEFAULT_API).replace(/\/$/, "");
  const url = `${base}/v1/preflight${opt.trial ? "?trial=1" : ""}`;
  const f = opt.trial || !opt.fetch ? fetch : opt.fetch;
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), opt.timeoutMs ?? 8000);
  try {
    const res = await f(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: ctl.signal,
      body: JSON.stringify({
        challenge: paymentRequired,
        resource_url: resource ?? undefined,
        rules: {
          max_per_payment_usd: rules.maxPerPaymentUsd, hold_above_usd: rules.holdAboveUsd, daily_cap_usd: rules.dailyCapUsd,
          allowed_networks: rules.allowedNetworks, usdc_only: rules.usdcOnly,
          domain_allowlist: rules.domainAllowlist, domain_blocklist: rules.domainBlocklist,
          payto_allowlist: rules.payToAllowlist, payto_blocklist: rules.payToBlocklist, strict_allowlist: rules.strictAllowlist,
        },
        context: { spent_today_usd: spentTodayUsd },
      }),
    });
    if (!res.ok) throw new Error(`SpendPreflight HTTP ${res.status}`);
    return (await res.json()) as { decision: Decision; reasons: string[]; receipt?: { id: string } };
  } finally { clearTimeout(t); }
}

/**
 * Attach the guard to an x402Client. Every payment the client is about to create is checked;
 * "block" and unapproved "hold" abort the payment before anything is signed.
 */
export function guard<C extends HookableClient>(client: C, options: GuardOptions = {}): C {
  const rules = { ...DEFAULT_RULES, ...(options.rules ?? {}) };
  const now = options.now ?? Date.now;
  const remote = options.remote === false ? false : options.remote;
  const apiHost = hostOf(remote ? remote.url ?? DEFAULT_API : DEFAULT_API);
  let day = new Date(now()).toISOString().slice(0, 10);
  let spent = 0;
  const pending = new WeakMap<object, number>();

  client.onBeforePaymentCreation(async (ctx: any) => {
    const today = new Date(now()).toISOString().slice(0, 10);
    if (today !== day) { day = today; spent = 0; }
    const req = ctx.selectedRequirements ?? {};
    const resource: string | null = ctx.paymentRequired?.resource?.url ?? req.resource ?? null;

    // Never guard payments to the SpendPreflight API itself (avoids recursion).
    if (hostOf(resource) === apiHost) return;

    const v = evaluateLocal(req, resource, rules, spent);
    if (v.decision !== "block" && remote) {
      try {
        const rr = await remotePreflight(ctx.paymentRequired, resource, rules, spent, remote);
        v.remote = rr;
        v.receiptId = rr.receipt?.id;
        for (const why of rr.reasons ?? []) if (!why.startsWith("allow")) v.reasons.push(`remote ${why}`);
        v.decision = worst(v.decision, rr.decision);
      } catch (e: any) {
        const fallback = remote.onError ?? "hold";
        v.reasons.push(`${fallback}: remote preflight unavailable (${e?.message ?? e})`);
        v.decision = worst(v.decision, fallback);
      }
    }

    let approved = v.decision === "allow";
    if (v.decision === "hold") approved = options.onHold ? await options.onHold(v) : false;
    await options.onDecision?.(v);
    if (!approved) return { abort: true, reason: `spendpreflight ${v.decision}: ${v.reasons.join("; ")}` };
    if (v.amountUsd != null) pending.set(ctx, v.amountUsd);
  });

  client.onAfterPaymentCreation?.(async (ctx: any) => {
    const amt = pending.get(ctx) ?? (() => {
      const r = ctx.selectedRequirements ?? {};
      const dec = USDC[String(r.asset ?? "").toLowerCase()];
      const a = r.amount ?? r.maxAmountRequired;
      return dec != null && a != null ? Number(a) / 10 ** dec : 0;
    })();
    if (hostOf(ctx.paymentRequired?.resource?.url ?? ctx.selectedRequirements?.resource) !== apiHost) spent += amt;
  });

  return client;
}
