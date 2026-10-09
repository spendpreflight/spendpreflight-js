import { x402Client } from '@x402/core/client';
import { wrapFetchWithPayment } from '@x402/fetch';
import { ExactEvmScheme } from '@x402/evm/exact/client';
import { find, verify, guard } from 'spendpreflight';

const API='https://api.spendpreflight.com';
const STAGING='https://spendpreflight-scout-staging.payee-check.workers.dev';
const PAY_TO='0xBf4164e07552e4c1b1B1597E72C7acAA3F0a1c58';
const NETWORK='eip155:8453';
/** This example can spend funds when invoked with a funded signer. Nothing runs on import. */
export async function findPreflightPay(
  signer: ConstructorParameters<typeof ExactEvmScheme>[0],
  task: string,
  options: { scoutApi?: string; preflightApi?: string; maxMerchantPrice?: number; transport?: typeof fetch } = {},
) {
  const scoutApi=options.scoutApi ?? STAGING; // Until production Scout rollout.
  const preflightApi=options.preflightApi ?? API;
  const ceiling=options.maxMerchantPrice ?? 0.05;
  if(!Number.isFinite(ceiling)||ceiling<=0)throw new Error('Set a positive merchant budget');
  const transport=options.transport ?? fetch;
  const screening=new x402Client().register(NETWORK,new ExactEvmScheme(signer));
  guard(screening,{remote:false,rules:{maxPerPaymentUsd:.02,holdAboveUsd:.02,dailyCapUsd:.10,
    allowedNetworks:[NETWORK],usdcOnly:true,payToAllowlist:[PAY_TO],
    domainAllowlist:[],strictAllowlist:true}});
  // Restrict the actual request origin/path too: quote metadata alone is not a URL boundary.
  const screenedTransport:typeof fetch=async(input,init)=>{
    const u=new URL(input instanceof Request?input.url:String(input));
    if(!((u.origin===scoutApi&&['/v1/find','/v1/verify'].includes(u.pathname))||(u.origin===preflightApi&&u.pathname==='/v1/preflight')))throw new Error('Unexpected screening URL');
    return transport(input,{...init,redirect:'error',credentials:'omit'});
  };
  const screeningFetch=wrapFetchWithPayment(screenedTransport,screening);
  const shortlist=await find({task,network:'base',maxPrice:ceiling,limit:10},{baseUrl:scoutApi,fetch:screeningFetch});
  const first=shortlist.results[0];if(!first)throw new Error('No matching verified observations; do not pay');
  const selected=await verify(first.resource,{baseUrl:scoutApi,fetch:screeningFetch});
  if(selected.probe_status!=='live'||selected.seller_risk==='high'||selected.price_usd===null||selected.price_usd>ceiling||!selected.pay_to||selected.network!==NETWORK||!selected.preflight_hint)throw new Error('Endpoint not eligible; do not pay');
  if(selected.preflight_hint.body.resource_method!=='GET')throw new Error('Example supports GET only; supply merchant-specific POST inputs separately');
  const preflight=await screeningFetch(preflightApi+'/v1/preflight',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...selected.preflight_hint.body,rules:{max_per_payment_usd:ceiling,hold_above_usd:ceiling}})});
  if(!preflight.ok||(await preflight.json() as {decision?:string}).decision!=='allow')throw new Error('Preflight did not allow; do not pay');
  // Discovery is a snapshot. The merchant guard checks the actual selected 402 again before signing.
  const merchant=new x402Client().register(NETWORK,new ExactEvmScheme(signer));
  guard(merchant,{remote:{url:preflightApi,fetch:screeningFetch,onError:'hold'},rules:{
    maxPerPaymentUsd:Math.min(ceiling,selected.price_usd),holdAboveUsd:ceiling,dailyCapUsd:ceiling,
    allowedNetworks:[NETWORK],usdcOnly:true,payToAllowlist:[selected.pay_to],
    domainAllowlist:[],strictAllowlist:true}});
  const exactResource:typeof fetch=async(input,init)=>{
    if((input instanceof Request?input.url:String(input))!==selected.resource)throw new Error('Unexpected merchant resource');
    return transport(input,{...init,redirect:'error',credentials:'omit'});
  };
  const response = await wrapFetchWithPayment(exactResource,merchant)(selected.resource);
  if(!response.ok)throw new Error("Merchant response unsuccessful; do not retry automatically");
  return response;
}
