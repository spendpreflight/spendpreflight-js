import {AsyncLocalStorage} from 'node:async_hooks';
import {evaluateLocal,guard,type Rules,type Verdict,type RemoteOptions,type HookableClient} from './index.js';

/** JSON-only policy for selected x402 v2 exact USDC requirements. Merchants are payTo addresses, not verified identities. */
export interface SpendPolicy {
 version:1; dailyCapUsd:number; maxPerCallUsd:number; holdAboveUsd:number;
 merchantAllowlist:string[]; merchantBlocklist:string[]; networkAllowlist:string[];
 assetAllowlist:{network:string;asset:string}[];
}
export interface SpendPolicyOptions {
 /** Omit for offline use. check() then holds; evaluate() is only a local preview. */
 remote?:Omit<RemoteOptions,'onError'>;
 /** Clock injection for offline tests. The existing budget never resets on a backward clock. */
 now?:()=>number;
}
const knownAssets:Record<string,string>={
 'eip155:8453':'0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
 'eip155:84532':'0x036cbd53842c5426634e7929541ec2318f3dcf7e',
 'eip155:1':'0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp':'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
};
const key=(v:string)=>/^0x[\da-f]{40}$/i.test(v)?v.toLowerCase():v;
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const strings=(v:unknown):v is string[]=>Array.isArray(v)&&v.length<=100&&v.every(s=>typeof s==='string'&&s.length>0&&s.length<=128&&s.trim()===s);
const policyKeys=['version','dailyCapUsd','maxPerCallUsd','holdAboveUsd','merchantAllowlist','merchantBlocklist','networkAllowlist','assetAllowlist'];

/** Reject misspelled/unknown fields and unsupported valuations instead of silently weakening policy. */
export function parseSpendPolicy(input:unknown):SpendPolicy {
 if(!object(input)||Object.keys(input).length!==policyKeys.length||Object.keys(input).some(k=>!policyKeys.includes(k))||input.version!==1)throw new Error('Invalid Spend Policy fields or version');
 for(const name of ['dailyCapUsd','maxPerCallUsd','holdAboveUsd']){
  const n=input[name];if(typeof n!=='number'||!Number.isFinite(n)||n<0||(name!=='holdAboveUsd'&&n===0)||!Number.isSafeInteger(Math.round(n*1e6))||Math.round(n*1e6)/1e6!==n)throw new Error('Policy limits require finite nonnegative amounts with at most six decimal places; caps must be positive');
 }
 for(const name of ['merchantAllowlist','merchantBlocklist','networkAllowlist'])if(!strings(input[name]))throw new Error('Invalid policy list: '+name);
 if((input.networkAllowlist as string[]).some(n=>!Object.hasOwn(knownAssets,n)))throw new Error('Unsupported policy network');
 if(!Array.isArray(input.assetAllowlist)||input.assetAllowlist.length>100||input.assetAllowlist.some(a=>!object(a)||Object.keys(a).sort().join(',')!=='asset,network'||typeof a.network!=='string'||typeof a.asset!=='string'||!Object.hasOwn(knownAssets,a.network)||knownAssets[a.network]!==key(a.asset)))throw new Error('Asset allowlist requires exact known network/native-USDC pairs');
 return JSON.parse(JSON.stringify(input)) as SpendPolicy;
}
const canonical=(value:any):string=>JSON.stringify(value&&typeof value==='object'?Array.isArray(value)?value.map(v=>JSON.parse(canonical(v))):Object.fromEntries(Object.keys(value).sort().map(k=>[k,JSON.parse(canonical(value[k]))])):value);
const denied=(reason:string):Verdict=>({decision:'block',reasons:['block: '+reason],amountUsd:null,payTo:'',network:'',resource:null});

/** One controller owns one in-process UTC-day reservation budget. It never signs, settles or sends a target request. */
export function createSpendPolicy(input:unknown,options:SpendPolicyOptions={}){
 const policy=parseSpendPolicy(input);
 const rules:Rules={dailyCapUsd:policy.dailyCapUsd,maxPerPaymentUsd:policy.maxPerCallUsd,holdAboveUsd:policy.holdAboveUsd,allowedNetworks:policy.networkAllowlist,payToAllowlist:policy.merchantAllowlist,payToBlocklist:policy.merchantBlocklist,strictAllowlist:true,usdcOnly:true};
 const remote=options.remote?{...options.remote,onError:'hold' as const}:undefined;
 const decisions=new AsyncLocalStorage<{verdict?:Verdict}>();
 let paymentHook!:(ctx:any)=>Promise<void|{abort:true;reason:string}>;
 guard({onBeforePaymentCreation(h){paymentHook=h;}},{rules,remote:remote??false,now:options.now,onDecision:v=>{const scope=decisions.getStore();if(scope)scope.verdict=structuredClone(v);}});

 function selected(challenge:unknown,requirement:unknown){
  const raw=JSON.stringify({challenge,requirement});if(!raw||new TextEncoder().encode(raw).length>60000)throw Error('Challenge too large');
  const copy=JSON.parse(raw),c=copy.challenge,r=copy.requirement;
  if(!object(c)||c.x402Version!==2||!Array.isArray(c.accepts)||c.accepts.length<1||c.accepts.length>20||!object(c.resource)||typeof c.resource.url!=='string'||!object(r)||r.scheme!=='exact'||typeof r.amount!=='string'||typeof r.payTo!=='string'||typeof r.network!=='string'||typeof r.asset!=='string')throw Error('Select an exact requirement from an x402 v2 challenge');
  const url=new URL(c.resource.url);if(url.protocol!=='https:'||url.username||url.password||url.hash)throw Error('Invalid resource URL');
  if(!c.accepts.some(a=>canonical(a)===canonical(r)))throw Error('Selected requirement is not in this challenge');
  return {challenge:c,requirement:r,resource:c.resource.url};
 }
 function local(c:ReturnType<typeof selected>,spentTodayUsd=0):Verdict{
  const r=c.requirement;
  const v=evaluateLocal(r,c.resource,rules,spentTodayUsd);
  if(!policy.merchantAllowlist.some(a=>key(a)===key(r.payTo as string))){v.decision='block';v.reasons.push('block: merchant payTo is not in the explicit allowlist');}
  if(!policy.assetAllowlist.some(a=>a.network===r.network&&key(a.asset)===key(r.asset as string))){v.decision='block';v.reasons.push('block: network/asset pair is not in the explicit allowlist');}
  return v;
 }
 /** Free pure preview; spentTodayUsd is caller-supplied context, not a settlement ledger or payment authorization. */
 function evaluate(challenge:unknown,requirement:unknown,spentTodayUsd=0):Verdict{
  try{return local(selected(challenge,requirement),spentTodayUsd);}catch{return denied('invalid challenge or selected requirement');}
 }
 /** Apply local gates, call the existing preflight_payment REST equivalent, and reserve an allowed amount before returning. */
 async function check(challenge:unknown,requirement:unknown):Promise<Verdict>{
  let c:ReturnType<typeof selected>;try{c=selected(challenge,requirement);}catch{return denied('invalid challenge or selected requirement');}
  const preview=local(c);if(preview.decision!=='allow')return preview;
  if(!remote)return {...preview,decision:'hold',reasons:[...preview.reasons,'hold: remote preflight required; offline preview cannot authorize payment']};
  const capture:{verdict?:Verdict}={};
  try{
   const result=await decisions.run(capture,()=>paymentHook({selectedRequirements:c.requirement,paymentRequired:c.challenge}));
   return capture.verdict??{...preview,decision:'hold',reasons:[result?.reason??'hold: preflight did not produce a decision']};
  }catch{return {...preview,decision:'hold',reasons:['hold: policy/preflight unavailable']};}
 }
 /** Attach before signing. No hold-approval callback or fail-open remote mode is exposed. */
 function attach<C extends HookableClient>(client:C):C{
  client.onBeforePaymentCreation(async ctx=>{
   try{
    const before=canonical({challenge:ctx.paymentRequired,requirement:ctx.selectedRequirements});
    const verdict=await check(ctx.paymentRequired,ctx.selectedRequirements);
    if(before!==canonical({challenge:ctx.paymentRequired,requirement:ctx.selectedRequirements}))return {abort:true,reason:'spend policy block: payment changed during preflight; reservation retained'};
    if(verdict.decision!=='allow')return {abort:true,reason:'spend policy '+verdict.decision+': '+verdict.reasons.join('; ')};
   }catch{return {abort:true,reason:'spend policy hold: invalid or unavailable policy decision'};}
  });return client;
 }
 return Object.freeze({evaluate,check,attach});
}
