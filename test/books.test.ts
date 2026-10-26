import {expect,it,vi} from 'vitest';
import {paymentReceipt,walletStatement,verifyPaymentReceipt} from '../src/books';
it('posts private filters once in the body with caller-owned authorization and no retry on402',async()=>{
 const fetcher=vi.fn(async()=>new Response(null,{status:402}));
 for(const [fn,input,path]of [[paymentReceipt,{tx_hash:'0xprivate'},'receipt'],[walletStatement,{address:'0xprivate',start:'a',end:'b'},'statement'],[verifyPaymentReceipt,{result:{},jws:'signed'},'verify']] as const){
  const r=await (fn as any)(input,{fetch:fetcher});expect(r.status).toBe(402);
  expect(fetcher.mock.calls.at(-1)).toEqual(['https://api.spendpreflight.com/v1/books/'+path,expect.objectContaining({method:'POST',redirect:'manual',body:JSON.stringify(input)})]);
 }expect(fetcher).toHaveBeenCalledTimes(3);
});
