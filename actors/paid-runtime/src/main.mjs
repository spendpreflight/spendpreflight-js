import {Actor} from 'apify';
import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import {parseInput,proofRegistry,deliver} from './channel.mjs';
const config=JSON.parse(readFileSync(new URL('../config.json',import.meta.url),'utf8'));
await Actor.init();let server;
try{
 const raw=await Actor.getInput();await Actor.setValue('INPUT',null);
 const selfTest=raw?._self_test===true;
 const candidate=selfTest?Object.fromEntries(Object.entries(raw).filter(([k])=>k!=='_self_test')):raw;
 const input=parseInput(candidate,config.operation),runId=Actor.getEnv().actorRunId;
 if(!runId)throw Error('Requires an Apify limited-permission run');
 if(selfTest){
  // Explicit operator test: exercise platform startup/input deletion/output access,
  // never a real product result, target probe, chain query or chargeable event.
  await Actor.setValue('SELFTEST',{passed:true,operation:config.operation,scope:'Platform wrapper only; no real lookup or event charged'});
  console.log('Operator platform self-test passed; no product lookup or event charged.');
 }else{
 const proof=proofRegistry(config.operation);server=createServer(proof.handler);
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(Number(process.env.ACTOR_WEB_SERVER_PORT??process.env.APIFY_CONTAINER_PORT??4321),'0.0.0.0',resolve);});
 const nonce=proof.add(input);
 const response=await fetch('https://api.spendpreflight.com/channels/apify/'+config.operation,{method:'POST',redirect:'error',signal:AbortSignal.timeout(120000),headers:{'Content-Type':'application/json'},body:JSON.stringify({run_id:runId,nonce,input})});
 proof.remove(nonce);
 if(!response.ok)throw Error('Product unavailable; no result event charged');
 const body=await response.json();if(!body.result||typeof body.result!=='object')throw Error('Invalid response');
 const delivered=await deliver(body.result,config,Actor);
 console.log(delivered?'One result delivered; no query/result values logged.':'Event budget exhausted; no result delivered.');
 }
}catch{console.error('Result not completed. Check input, event budget and service availability. No automatic retry; inspect an ambiguous charge/output before a new run.');process.exitCode=1;}
finally{if(server)await new Promise(resolve=>server.close(resolve));await Actor.exit({exit:false});}
