import {createHash,randomBytes} from 'node:crypto';
export function parseInput(value){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>k!=='addresses')||!Array.isArray(value.addresses)||value.addresses.length<1||value.addresses.length>100||value.addresses.some(a=>typeof a!=='string'||!/^[A-Za-z0-9]{20,128}$/.test(a)))throw Error('Expected 1–100 public addresses with no extra input fields');
 return {addresses:[...value.addresses]};
}
export function proofRegistry(){
 const pending=new Map();
 return {
  add(input){const nonce=randomBytes(32).toString('hex');pending.set(nonce,{digest:createHash('sha256').update(JSON.stringify(input)).digest('hex'),operation:'sanctions'});return nonce;},
  handler(req,res){const key=/^\/spendpreflight-proof\/([a-f0-9]{64})$/.exec(req.url??'')?.[1];const value=req.method==='GET'&&key?pending.get(key):null;if(key)pending.delete(key);res.writeHead(value?200:404,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value??{error:'unavailable'}));},
  remove(nonce){pending.delete(nonce);}
 };
}
export async function deliver(results,actor){
 let delivered=0;
 for(const row of results){
  // Never publish an uncharged result or silently exceed the user's event budget.
  const charged=await actor.charge({eventName:'address-screened',count:1});
  if(charged.chargedCount!==1)break;
  await actor.pushData(row);delivered++;
 }
 return delivered;
}
