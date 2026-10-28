import {createHash,randomBytes} from 'node:crypto';
const address=v=>typeof v==='string'&&/^0x[0-9a-fA-F]{40}$/.test(v);
const stamp=v=>typeof v==='string'&&/^\d{4}-\d\d-\d\dT/.test(v)&&Number.isFinite(Date.parse(v));
function range(v,now){return stamp(v.start)&&stamp(v.end)&&Date.parse(v.start)<Date.parse(v.end)&&Date.parse(v.end)<=now&&Date.parse(v.end)-Date.parse(v.start)<=90*86400000;}
export function parseInput(value,operation,now=Date.now()){
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Invalid input');
 const keys=Object.keys(value),only=allowed=>keys.every(k=>allowed.includes(k));
 let valid=false;
 if(operation==='lint'){
  try{const u=new URL(value.url);valid=only(['url','method'])&&typeof value.url==='string'&&value.url.length<=2048&&u.protocol==='https:'&&!u.username&&!u.password&&!u.hash&&['GET','HEAD','POST'].includes(value.method);}catch{}
 }else if(operation==='receipt'){
  valid=only(['tx_hash','log_index','pay_to','amount','start','end'])&&(
   (typeof value.tx_hash==='string'&&/^0x[0-9a-fA-F]{64}$/.test(value.tx_hash)&&keys.every(k=>['tx_hash','log_index'].includes(k))&&(value.log_index===undefined||Number.isSafeInteger(value.log_index)&&value.log_index>=0))||
   (value.tx_hash===undefined&&value.log_index===undefined&&address(value.pay_to)&&typeof value.amount==='string'&&/^(?:0|[1-9][0-9]{0,70})(?:\.[0-9]{1,6})?$/.test(value.amount)&&range(value,now)));
 }else if(operation==='token')valid=only(['address','chain'])&&address(value.address)&&(value.chain===undefined||value.chain==='eip155:8453');
 else if(operation==='statement')valid=only(['address','start','end'])&&address(value.address)&&range(value,now);
 if(!valid)throw Error('Invalid or excessive product input');
 return {...value};
}
export function proofRegistry(operation){
 const pending=new Map();return {
  add(input){const nonce=randomBytes(32).toString('hex');pending.set(nonce,{digest:createHash('sha256').update(JSON.stringify(input)).digest('hex'),operation});return nonce;},
  handler(req,res){const key=/^\/spendpreflight-proof\/([a-f0-9]{64})$/.exec(req.url??'')?.[1];const value=req.method==='GET'&&key?pending.get(key):null;if(key)pending.delete(key);res.writeHead(value?200:404,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value??{error:'unavailable'}));},
  remove(nonce){pending.delete(nonce);}
 };
}
export async function deliver(result,config,actor){
 const charged=await actor.charge({eventName:config.event,count:1});
 if(charged.chargedCount!==1)return false;
 await actor.pushData(result);
 if(config.operation==='receipt')await actor.setValue('receipt.html',result.printable_html,{contentType:'text/html; charset=utf-8'});
 if(config.operation==='statement')await actor.setValue('statement.csv',result.csv,{contentType:'text/csv; charset=utf-8'});
 return true;
}
