import {it,expect,vi} from 'vitest';
import {createSpendPolicy,parseSpendPolicy,type SpendPolicy} from '../src/index';
const asset='0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',payTo='0x'+'1'.repeat(40);
const policy:SpendPolicy={version:1,dailyCapUsd:.02,maxPerCallUsd:.02,holdAboveUsd:.02,merchantAllowlist:[payTo],merchantBlocklist:[],networkAllowlist:['eip155:8453'],assetAllowlist:[{network:'eip155:8453',asset}]};
const requirement={scheme:'exact',network:'eip155:8453',asset,amount:'10000',payTo};
const challenge=(r=requirement)=>({x402Version:2,resource:{url:'https://merchant.example/data'},accepts:[r]});
const response=(decision='allow')=>Response.json({decision,reasons:[decision+': fixture'],receipt:{id:'offline-fixture'}});
const remote=()=>vi.fn(async()=>response());

it('accepts JSON policy and rejects misspellings, unsafe amounts, wrong assets, invalid lists and unsupported versions',()=>{
 expect(parseSpendPolicy(JSON.parse(JSON.stringify(policy)))).toEqual(policy);
 for(const bad of [null,[],{}, {...policy,version:2},{...policy,extra:true},{...policy,dailyCapUsd:NaN},{...policy,maxPerCallUsd:0},{...policy,holdAboveUsd:-1},{...policy,dailyCapUsd:1e20},{...policy,holdAboveUsd:.0000001},{...policy,networkAllowlist:['base']},{...policy,assetAllowlist:[{network:'eip155:1',asset}]},{...policy,merchantAllowlist:['']},{...policy,merchantBlocklist:['x'.repeat(129)]},{...policy,assetAllowlist:[{network:'eip155:8453',asset,extra:true}]}])expect(()=>parseSpendPolicy(bad)).toThrow();
});
it('offline evaluation never authorizes signing, and no implicit network, trial or payment occurs',async()=>{
 const spy=vi.spyOn(globalThis,'fetch').mockRejectedValue(Error('No network'));
 try{const p=createSpendPolicy(policy);expect(p.evaluate(challenge(),requirement).decision).toBe('allow');expect((await p.check(challenge(),requirement)).decision).toBe('hold');expect(spy).not.toHaveBeenCalled();}finally{spy.mockRestore();}
});
it('blocks merchant/asset/network exclusions and holds above threshold without calling preflight',async()=>{
 for(const [overrides,decision] of [[{merchantBlocklist:[payTo]},'block'],[{merchantAllowlist:[]},'block'],[{assetAllowlist:[]},'block'],[{networkAllowlist:[]},'block'],[{maxPerCallUsd:.009},'block'],[{holdAboveUsd:.009},'hold']] as const){
  const fetch=remote();const p=createSpendPolicy({...policy,...overrides},{remote:{fetch}});expect((await p.check(challenge(),requirement)).decision).toBe(decision);expect(fetch).not.toHaveBeenCalled();
 }
});
it('requires an unchanged exact selected option, bounded v2 challenge and safe resource',async()=>{
 const fetch=remote(),p=createSpendPolicy(policy,{remote:{fetch}});
 for(const c of [{...challenge(),x402Version:1},{...challenge(),accepts:[]},{...challenge(),resource:{url:'https://user:password@merchant.example/'}},{...challenge(),resource:{url:'http://merchant.example/'}},{...challenge(),extra:'x'.repeat(60001)}])expect((await p.check(c,requirement)).decision).toBe('block');
 expect((await p.check(challenge(),{...requirement,amount:'9999'})).decision).toBe('block');
 expect((await p.check(challenge({...requirement,amount:'-1'}),{...requirement,amount:'-1'})).decision).toBe('block');expect(fetch).not.toHaveBeenCalled();
});
it('uses the existing preflight endpoint with only the selected requirement and caps',async()=>{
 const fetch=vi.fn(async(url:any,init:any)=>{
  expect(url).toBe('https://api.spendpreflight.com/v1/preflight');expect(init.redirect).toBe('error');
  const body=JSON.parse(init.body);expect(body.challenge.accepts).toEqual([requirement]);expect(body.rules).toMatchObject({daily_cap_usd:.02,max_per_payment_usd:.02,hold_above_usd:.02,payto_allowlist:[payTo]});return response();
 });
 const p=createSpendPolicy(policy,{remote:{fetch}});const verdict=await p.check({...challenge(),accepts:[{...requirement,amount:'20000'},requirement]},requirement);
 expect(verdict).toMatchObject({decision:'allow',receiptId:'offline-fixture',amountUsd:.01});expect(fetch).toHaveBeenCalledTimes(1);
});
it('serializes concurrent reservations and retains allowed but abandoned amounts',async()=>{
 const fetch=remote(),p=createSpendPolicy(policy,{remote:{fetch}});
 const decisions=await Promise.all(Array.from({length:20},()=>p.check(challenge(),requirement)));
 expect(decisions.filter(v=>v.decision==='allow')).toHaveLength(2);expect(decisions.filter(v=>v.decision==='block')).toHaveLength(18);expect(fetch).toHaveBeenCalledTimes(2);
 expect((await p.check(challenge(),requirement)).decision).toBe('block');
});
it('resets only on a later UTC day and isolates separate controllers',async()=>{
 let now=Date.parse('2026-11-09T13:00:00Z');const p=createSpendPolicy({...policy,dailyCapUsd:.01},{remote:{fetch:remote()},now:()=>now});
 expect((await p.check(challenge(),requirement)).decision).toBe('allow');now-=86400000;expect((await p.check(challenge(),requirement)).decision).toBe('block');now+=2*86400000;expect((await p.check(challenge(),requirement)).decision).toBe('allow');
 const other=createSpendPolicy({...policy,dailyCapUsd:.01},{remote:{fetch:remote()}});expect((await other.check(challenge(),requirement)).decision).toBe('allow');
});
it('cannot mutate a configured policy to expand the budget or allowlists',async()=>{
 const input=structuredClone(policy),p=createSpendPolicy(input,{remote:{fetch:remote()}});input.merchantAllowlist.push('0x'+'2'.repeat(40));input.dailyCapUsd=100;
 const other={...requirement,payTo:'0x'+'2'.repeat(40)};expect((await p.check(challenge(other),other)).decision).toBe('block');
 for(let i=0;i<2;i++)expect((await p.check(challenge(),requirement)).decision).toBe('allow');expect((await p.check(challenge(),requirement)).decision).toBe('block');
});
it('never fails open or approves remote holds, malformed results, HTTP402, timeouts or errors',async()=>{
 const cases=[async()=>response('hold'),async()=>response('block'),async()=>response('approve'),async()=>new Response('',{status:402}),async()=>{throw Error('unavailable');},async()=>new Promise<Response>(()=>{})];
 for(const fetch of cases){const p=createSpendPolicy(policy,{remote:{fetch,onError:'allow',timeoutMs:5} as any});expect((await p.check(challenge(),requirement)).decision).not.toBe('allow');}
});
it('the attached hook aborts holds and changed requirements, retaining the preflight reservation',async()=>{
 let finish!:(r:Response)=>void,start!:()=>void;const started=new Promise<void>(resolve=>{start=resolve;});
 const p=createSpendPolicy({...policy,dailyCapUsd:.01},{remote:{fetch:async()=>{start();return new Promise(resolve=>{finish=resolve;});}}});
 let hook:any;p.attach({onBeforePaymentCreation:h=>{hook=h;}});const r={...requirement},ctx={paymentRequired:challenge(r),selectedRequirements:r};
 const pending=hook(ctx);await started;r.amount='20000';finish(response());expect(await pending).toMatchObject({abort:true,reason:expect.stringContaining('changed')});expect((await p.check(challenge(),requirement)).decision).toBe('block');
 const offline=createSpendPolicy(policy);offline.attach({onBeforePaymentCreation:h=>{hook=h;}});expect(await hook({paymentRequired:challenge(),selectedRequirements:requirement})).toMatchObject({abort:true});
});
it('blocks recursive screening through the same controller without deadlocking',async()=>{
 let p:ReturnType<typeof createSpendPolicy>;const fetch=vi.fn(async()=>{expect((await p.check(challenge(),requirement)).decision).toBe('hold');return response();});
 p=createSpendPolicy(policy,{remote:{fetch}});expect((await p.check(challenge(),requirement)).decision).toBe('allow');expect(fetch).toHaveBeenCalledTimes(1);
});
it('preserves Solana case sensitivity and exact EVM recipient comparisons',()=>{
 const p=createSpendPolicy(policy);expect(p.evaluate(challenge({...requirement,payTo:payTo.toUpperCase().replace('0X','0x')}),{...requirement,payTo:payTo.toUpperCase().replace('0X','0x')}).decision).toBe('allow');
 const network='solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',asset='EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',r={...requirement,network,asset,payTo:'CaseSensitiveMerchant'};
 const s=createSpendPolicy({...policy,networkAllowlist:[network],assetAllowlist:[{network,asset}],merchantAllowlist:[r.payTo]});expect(s.evaluate(challenge(r),r).decision).toBe('allow');const changed={...r,payTo:r.payTo.toLowerCase()};expect(s.evaluate(challenge(changed),changed).decision).toBe('block');
});
