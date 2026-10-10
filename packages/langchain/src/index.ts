import {tool} from '@langchain/core/tools';
import {z} from 'zod';

const checkInput=z.object({address:z.string().regex(/^0x[0-9a-fA-F]{40}$/).optional(),name:z.string().min(1).max(200).optional(),domain:z.string().min(1).max(253).optional()}).refine(x=>!!(x.address||x.name||x.domain),'Supply an address, name or domain');
const checkOutput=z.object({risk:z.enum(['low','medium','high','unknown']),flags:z.array(z.string())}).passthrough();
const preflightInput=z.object({challenge:z.record(z.string(),z.unknown()).optional(),cart:z.record(z.string(),z.unknown()).optional(),rules:z.record(z.string(),z.unknown()).optional(),context:z.record(z.string(),z.unknown()).optional()}).refine(x=>!!x.challenge!==!!x.cart,'Supply exactly one challenge or cart');
const preflightOutput=z.object({decision:z.enum(['allow','hold','block']),reasons:z.array(z.string()),receipt:z.object({id:z.string()}).passthrough()}).passthrough();

/** Inject a separately bounded x402-paying fetch. The model never receives wallet keys. */
export function createSpendPreflightTools(screeningFetch:typeof fetch){
 async function request(path:string,init:RequestInit,schema:z.ZodType){
  const response=await screeningFetch('https://api.spendpreflight.com'+path,{...init,redirect:'error',signal:AbortSignal.timeout(8000)});
  if(!response.ok)throw Error(`SpendPreflight unavailable (HTTP ${response.status}); hold payment`);
  const parsed=schema.safeParse(await response.json());
  if(!parsed.success)throw Error('Invalid SpendPreflight response; hold payment');
  return JSON.stringify(parsed.data);
 }
 return [
  tool(async input=>request('/v1/check?'+new URLSearchParams(Object.entries(input).filter(([,v])=>!!v) as [string,string][]),{},checkOutput),{
   name:'check_payee',description:'Operated by SpendPreflight. Screen a payee against OFAC and domain signals. Costs $0.01 Base USDC. Unknown is not approval; informational screening, not certification. Does not pay the merchant.',schema:checkInput,
  }),
  tool(async input=>request('/v1/preflight',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)},preflightOutput),{
   name:'preflight_payment',description:'Operated by SpendPreflight. Check an x402 challenge or cart against spending rules; preserve allow/hold/block and the signed receipt. Costs $0.02 Base USDC. Does not pay the merchant; enforce hold/block before signing.',schema:preflightInput,
  }),
 ];
}
