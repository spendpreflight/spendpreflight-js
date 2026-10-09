import { expect, it, vi } from "vitest";
import { evaluateLocal, guard, type HookableClient } from "../src/index";
const req = { scheme: "exact", network: "eip155:8453", asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", amount: "10000", payTo: "0x1111111111111111111111111111111111111111" };
const ctx = (selected=req) => ({ selectedRequirements:selected, paymentRequired:{x402Version:2,resource:{url:"https://merchant.com"},accepts:[req,selected]} });
function client(){let hook:(c:any)=>Promise<any>;const c:HookableClient={onBeforePaymentCreation:h=>{hook=h;}};return{c,run:(v=ctx())=>hook(v)};}
it("blocks malformed amounts, chain/asset mismatches, invalid rules and preserves Solana case",()=>{
 for(const a of ['NaN','-1','Infinity','1e6','1.5','01','９','9'.repeat(79),'9007199254740992'])expect(evaluateLocal({...req,amount:a},null).decision).toBe('block');
 expect(evaluateLocal({...req,network:'eip155:1'},null,{allowedNetworks:['eip155:1']}).decision).toBe('block');
 expect(evaluateLocal(req,null,{maxPerPaymentUsd:NaN}).decision).toBe('block');
 const sol={...req,network:'solana',asset:'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',payTo:'SoLPayee'};
 expect(evaluateLocal(sol,null,{allowedNetworks:['solana']}).decision).toBe('allow');
 expect(evaluateLocal({...sol,asset:sol.asset.toLowerCase()},null,{allowedNetworks:['solana']}).decision).toBe('block');
 expect(evaluateLocal(sol,null,{allowedNetworks:['solana'],payToBlocklist:['solpayee']}).decision).toBe('allow');
});
it("reserves concurrently approved authorizations before any signing callbacks and never refunds abandoned ones",async()=>{
 const c=client();guard(c.c,{remote:false,rules:{dailyCapUsd:.025}});
 const results=await Promise.all(Array.from({length:20},()=>c.run()));expect(results.filter(x=>x===undefined)).toHaveLength(2);expect(await c.run()).toMatchObject({abort:true});
});
it("does not reset a daily budget when the local clock moves backward",async()=>{
 let now=Date.parse('2026-10-09T09:00:00Z');const c=client();guard(c.c,{now:()=>now,remote:false,rules:{dailyCapUsd:.01}});
 expect(await c.run()).toBeUndefined();now-=86_400_000;expect(await c.run()).toMatchObject({abort:true});now+=2*86_400_000;expect(await c.run()).toBeUndefined();
});
it("screens only the actual selected option, requires valid remote decisions and rejects host spoofing",async()=>{
 const c=client();const selected={...req,amount:'20000'};
 const remote=vi.fn(async(_u:any,init:any)=>{expect(JSON.parse(init.body).challenge.accepts).toEqual([selected]);expect(init.redirect).toBe('error');return Response.json({decision:'approve',reasons:[]});});
 guard(c.c,{remote:{fetch:remote as any}});expect(await c.run(ctx(selected))).toMatchObject({abort:true});
 const local=client();guard(local.c,{remote:false,rules:{maxPerPaymentUsd:.005}});const forged=ctx();forged.paymentRequired.resource.url='https://api.spendpreflight.com/v1/preflight';expect(await local.run(forged)).toMatchObject({abort:true});
});
it("rejects recursive paid screening immediately without a hostname exemption or lock deadlock",async()=>{
 const c=client();const nested:any[]=[];
 guard(c.c,{remote:{fetch:(async()=>{nested.push(await c.run());throw Error('screen denied');}) as any}});
 expect(await c.run()).toMatchObject({abort:true});expect(nested).toHaveLength(1);expect(nested[0].reason).toContain('recursive');
});
it("enforces deadlines even when a custom fetch ignores abort and keeps unknown amounts unapproved",async()=>{
 const c=client();guard(c.c,{remote:{fetch:(()=>new Promise(()=>{})) as any,timeoutMs:10}});expect(await c.run()).toMatchObject({abort:true});
 const unknown=client();guard(unknown.c,{remote:false,rules:{usdcOnly:false},onHold:()=>true});expect(await unknown.run(ctx({...req,asset:'unknown'}))).toMatchObject({abort:true});
});
