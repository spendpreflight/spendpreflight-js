import {it,expect,vi} from 'vitest';
import {quoteCheck,createQuoteCheckHook,type QuoteCheckInput} from '../src/index';
const input:QuoteCheckInput={url:'https://merchant.example.org/data',amount:'10000',asset:'0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',network:'eip155:8453',payTo:'0x'+'1'.repeat(40)};
const response=(status='ok',override:any={})=>({status,comparison:input,multiple:status==='unknown'?null:'1.000000',suggested_max_amount_per_payment:status==='unknown'?null:{amount:'10000',asset:input.asset,network:input.network,expires_at:new Date(Date.now()+100000).toISOString(),basis:'historical observation'},not_charged:status==='unknown',limits:'Historical, informational only',...override});
const ctx={paymentRequired:{x402Version:2,resource:{url:input.url}},selectedRequirements:{...input,scheme:'exact'}};
it('calls only the explicit comparison API using GET, no credentials, redirect or automatic paid fallback',async()=>{
 const f=vi.fn(async()=>Response.json(response()));const result=await quoteCheck(input,{fetch:f});expect(result.status).toBe('ok');expect(f).toHaveBeenCalledTimes(1);
 const [u,init]=f.mock.calls[0] as any;expect(u.origin).toBe('https://api.spendpreflight.com');expect(u.pathname).toBe('/quote-check');expect(u.searchParams.get('url')).toBe(input.url);expect(init).toMatchObject({method:'GET',redirect:'error',credentials:'omit',referrerPolicy:'no-referrer'});
 const denied=vi.fn(async()=>new Response(null,{status:402}));await expect(quoteCheck(input,{fetch:denied})).rejects.toThrow();expect(denied).toHaveBeenCalledTimes(1);
});
it('rejects private URL fields and malformed amounts before making even a fee request',async()=>{
 const f=vi.fn();for(const bad of [{url:'https://127.0.0.1/'},{url:'https://u:p@merchant.example.org/'},{url:input.url+'?api_key=private'},{amount:'0.01'},{url:'http://merchant.example.org/'}])await expect(quoteCheck({...input,...bad},{fetch:f})).rejects.toThrow();expect(f).not.toHaveBeenCalled();
});
it('fails closed for unknown, price increase, recipient change, malformed response and wrong comparison identity',async()=>{
 for(const status of ['unknown','above_expected','payTo_changed'])expect(await createQuoteCheckHook({fetch:async()=>Response.json(response(status))})(ctx)).toMatchObject({abort:true});
 for(const value of [{},response('ok',{comparison:{...input,amount:'1'}}),response('ok',{suggested_max_amount_per_payment:null}),response('ok',{suggested_max_amount_per_payment:{amount:'10000',asset:input.asset,network:input.network,expires_at:'2000-01-01'}})])expect(await createQuoteCheckHook({fetch:async()=>Response.json(value)})(ctx)).toMatchObject({abort:true});
});
it('allows an informational ok result to continue without replacing local limits, applying a cap or creating a signature',async()=>{
 const onResult=vi.fn();expect(await createQuoteCheckHook({fetch:async()=>Response.json(response()),onResult})(ctx)).toBeUndefined();expect(onResult).toHaveBeenCalledOnce();expect(ctx.selectedRequirements.amount).toBe('10000');
 expect(await createQuoteCheckHook({fetch:async()=>Response.json(response())})({...ctx,selectedRequirements:{...ctx.selectedRequirements,scheme:'upto'}})).toMatchObject({abort:true});
});
it('blocks recursion if the supplied paid fetch uses this same hook',async()=>{
 let calls=0;let hook:ReturnType<typeof createQuoteCheckHook>;hook=createQuoteCheckHook({fetch:async()=>{calls++;expect(await hook(ctx)).toMatchObject({abort:true,reason:expect.stringContaining('recursive')});throw Error('Fee client aborted');}});expect(await hook(ctx)).toMatchObject({abort:true});expect(calls).toBe(1);
});
it('bounds the response and deadline even when a caller-supplied fetch ignores abort',async()=>{
 expect(await createQuoteCheckHook({fetch:async()=>new Response('x'.repeat(65537))})(ctx)).toMatchObject({abort:true});
 await expect(quoteCheck(input,{fetch:()=>new Promise(()=>{}),timeoutMs:5})).rejects.toThrow('deadline');
});
