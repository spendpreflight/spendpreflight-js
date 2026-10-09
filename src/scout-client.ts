/** Scout HTTP helpers. Supply a separately guarded x402 fetch to pay our API only. */
export interface ScoutEndpoint {
  resource: string; service_name: string; description: string;
  price_usd: number | null; network: string | null; asset: string | null;
  pay_to: string | null; scheme: string | null;
  probe_status: 'live' | 'dead' | 'invalid_402' | 'timeout' | null;
  probed_at: string | null; seller_risk: 'low' | 'medium' | 'high'; seller_flags: string[];
  trust_score: number; l30_payers: number; bazaar_url: string;
  /** An active paid monitoring subscription, not an identity or delivery guarantee. */
  verified: boolean;
  preflight_hint: null | { url: '/v1/preflight'; body: {
    challenge: { x402Version: 1 | 2; resource?: { url: string }; accepts: Record<string, unknown>[] };
    resource_url: string; resource_method: string;
  }};
}
export interface FindOptions { task: string; maxPrice?: number; network?: string; limit?: number; includeUnverified?: boolean }
export interface ScoutOptions {
  /** Default production API. Scout currently requires the staging override until rollout. */
  baseUrl?: string;
  /** Plain fetch by default: a 402 is an error. Only your supplied wrapper can pay. */
  fetch?: typeof fetch;
  trial?: boolean;
  timeoutMs?: number;
  signal?: AbortSignal;
}
export interface ScoutResults { results: ScoutEndpoint[]; data_as_of: string | null }
export class ScoutError extends Error {
  constructor(message: string, public readonly status?: number) { super(message); this.name = 'ScoutError'; }
}
const https = (value: string) => {
  const u = new URL(value);
  if(u.protocol !== 'https:' || u.username || u.password || u.hash) throw new ScoutError('Expected an HTTPS URL without credentials or fragment');
  return u;
};
function endpoint(value: any): value is ScoutEndpoint {
  if(!value || typeof value !== 'object')return false;
  try { https(value.resource); } catch { return false; }
  return typeof value.service_name === 'string' && typeof value.description === 'string'
    && (value.price_usd === null || (Number.isFinite(value.price_usd) && value.price_usd >= 0))
    && ['live','dead','invalid_402','timeout',null].includes(value.probe_status)
    && ['low','medium','high'].includes(value.seller_risk)
    && Number.isFinite(value.trust_score) && value.trust_score >= 0 && value.trust_score <= 100
    && Number.isSafeInteger(value.l30_payers) && value.l30_payers >= 0
    && ['network','asset','pay_to','scheme','probed_at'].every(k=>value[k] === null || typeof value[k] === 'string')
    && Array.isArray(value.seller_flags) && value.seller_flags.every((s:unknown)=>typeof s === 'string')
    && typeof value.verified === 'boolean' && typeof value.bazaar_url === 'string'
    && (value.preflight_hint === null || (value.preflight_hint?.url === '/v1/preflight'
      && value.preflight_hint.body?.resource_url === value.resource
      && ['GET','POST','HEAD'].includes(value.preflight_hint.body.resource_method)
      && [1,2].includes(value.preflight_hint.body.challenge?.x402Version)
      && Array.isArray(value.preflight_hint.body.challenge.accepts)
      && value.preflight_hint.body.challenge.accepts.length > 0));
}
async function request(path: string, query: URLSearchParams, options: ScoutOptions): Promise<any> {
  const base = https(options.baseUrl ?? 'https://api.spendpreflight.com');
  if(base.pathname !== '/' || base.search)throw new ScoutError('baseUrl must be an HTTPS origin');
  const url = new URL(path,base);
  url.search = query.toString();
  if(options.trial)url.searchParams.set('trial','1');
  const ms = options.timeoutMs ?? 15000;
  if(!Number.isFinite(ms) || ms < 1 || ms > 120000)throw new ScoutError('timeoutMs must be between 1 and 120000');
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abort: (()=>void) | undefined;
  const deadline = new Promise<never>((_,reject)=>{
    const stop = (message:string)=>{controller.abort();reject(new ScoutError(message));};
    timer = setTimeout(()=>stop('Scout deadline exceeded; payment outcome may be unknown; do not retry automatically'),ms);
    abort = ()=>stop('Scout request aborted; payment outcome may be unknown; do not retry automatically');
    if(options.signal?.aborted)abort();else options.signal?.addEventListener('abort',abort,{once:true});
  });
  try {
    return await Promise.race([deadline,(async()=>{
      if(controller.signal.aborted)throw new ScoutError('Scout request aborted');
      const response = await (options.fetch ?? fetch)(url,{method:'GET',redirect:'error',credentials:'omit',signal:controller.signal,headers:{Accept:'application/json'}});
      if(!response.ok){void response.body?.cancel().catch(()=>{});throw new ScoutError('Scout HTTP '+response.status,response.status);}
      const reader = response.body?.getReader();
      if(!reader)throw new ScoutError('Scout returned an empty response');
      const chunks:Uint8Array[]=[];let size=0;
      try {while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>1048576)throw new ScoutError('Scout response exceeds 1 MiB');chunks.push(part.value);}}
      catch(error){void reader.cancel().catch(()=>{});throw error;}
      const bytes=new Uint8Array(size);let offset=0;for(const part of chunks){bytes.set(part,offset);offset+=part.length;}
      try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{throw new ScoutError('Scout returned invalid JSON');}
    })()]);
  } finally { clearTimeout(timer);if(abort)options.signal?.removeEventListener('abort',abort);controller.abort(); }
}
/** Find a trust-ranked shortlist; never requests or pays a merchant resource. */
export async function find(input: FindOptions, options: ScoutOptions = {}): Promise<ScoutResults> {
  const words = typeof input.task === 'string' ? input.task.match(/[\p{L}\p{N}]+/gu) : null;
  if(!words?.length || words.length>16 || input.task.length>256 || /[\u0000-\u001f]/.test(input.task))throw new ScoutError('task must contain 1–16 words and at most 256 characters');
  if(input.limit !== undefined && (!Number.isInteger(input.limit)||input.limit<1||input.limit>10))throw new ScoutError('limit must be 1–10');
  if(input.maxPrice !== undefined && (!Number.isFinite(input.maxPrice)||input.maxPrice<0))throw new ScoutError('maxPrice must be nonnegative');
  if(input.includeUnverified !== undefined && typeof input.includeUnverified !== 'boolean')throw new ScoutError('includeUnverified must be boolean');
  const query=new URLSearchParams({task:input.task});
  if(input.limit!==undefined)query.set('limit',String(input.limit));
  if(input.maxPrice!==undefined)query.set('max_price',String(input.maxPrice));
  if(input.network!==undefined)query.set('network',input.network);
  if(input.includeUnverified!==undefined)query.set('include_unverified',String(input.includeUnverified));
  const result=await request('/v1/find',query,options);
  if(!Array.isArray(result?.results)||result.results.length>(input.limit??10)||!result.results.every(endpoint)||(result.data_as_of!==null&&typeof result.data_as_of!=='string'))throw new ScoutError('Invalid Scout search response');
  return result;
}
/** Refresh a publicly listed endpoint (cache ≤1h); never pays the endpoint. */
export async function verify(resourceUrl: string, options: ScoutOptions = {}): Promise<ScoutEndpoint> {
  https(resourceUrl);
  const result=await request('/v1/verify',new URLSearchParams({url:resourceUrl}),options);
  if(!endpoint(result)||result.resource!==resourceUrl)throw new ScoutError('Invalid Scout verification response');
  return result;
}
