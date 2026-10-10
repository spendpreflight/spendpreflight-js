import {describe,it,expect,vi} from 'vitest';
import {createSpendPreflightTools} from '../packages/langchain/src/index';
describe('standalone LangChain tools',()=>{
 it('uses the real tool interface and a fixed screening origin without exposing wallet configuration',async()=>{
  const fetcher=vi.fn(async(_u:any,init:any)=>{expect(init.redirect).toBe('error');expect(init.signal).toBeInstanceOf(AbortSignal);return Response.json({risk:'unknown',flags:['fixture']});});
  const [check]=createSpendPreflightTools(fetcher as any);expect(JSON.parse(await check!.invoke({name:'Acme & Sons'}))).toEqual({risk:'unknown',flags:['fixture']});expect(fetcher.mock.calls[0]![0]).toBe('https://api.spendpreflight.com/v1/check?name=Acme+%26+Sons');
 });
 it('preserves hold and block with receipt evidence',async()=>{
  for(const decision of ['hold','block']){const data={decision,reasons:['policy'],receipt:{id:'receipt',jws:'signed-evidence'}};const [,preflight]=createSpendPreflightTools((async()=>Response.json(data)) as any);expect(JSON.parse(await preflight!.invoke({cart:{total_usd:1}}))).toEqual(data);}
 });
 it('rejects invalid tool inputs before calling the transport',async()=>{
  const f=vi.fn();const [check,preflight]=createSpendPreflightTools(f as any);await expect(check!.invoke({})).rejects.toThrow();await expect(preflight!.invoke({cart:{},challenge:{}})).rejects.toThrow();expect(f).not.toHaveBeenCalled();
 });
 it('fails closed on HTTP, malformed schema and network failure without retrying',async()=>{
  for(const impl of [async()=>new Response('',{status:503}),async()=>Response.json({risk:'safe'}),async()=>{throw Error('network');}]){const f=vi.fn(impl);const [check]=createSpendPreflightTools(f as any);await expect(check!.invoke({name:'Acme'})).rejects.toThrow();expect(f).toHaveBeenCalledTimes(1);}
 });
});
