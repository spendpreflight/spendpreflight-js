import {Actor} from 'apify';
import {createServer} from 'node:http';
import {parseInput,proofRegistry,deliver} from './channel.mjs';
import {signedEnvelope} from './attestation.mjs';
await Actor.init();
let server;
try{
 const raw=await Actor.getInput();
 // The runtime reads INPUT once; no input values or results enter logs.
 await Actor.setValue('INPUT',null);
 const selfTest=raw?._self_test===true;
 const candidate=selfTest?Object.fromEntries(Object.entries(raw).filter(([k])=>k!=='_self_test')):raw;
 const input=parseInput(candidate);
 const runId=Actor.getEnv().actorRunId;
 if(!runId)throw Error('Run on Apify with limited permissions');
 const proof=proofRegistry();server=createServer(proof.handler);
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(Number(process.env.ACTOR_WEB_SERVER_PORT??process.env.APIFY_CONTAINER_PORT??4321),'0.0.0.0',resolve);});
 const nonce=proof.add(input);
 const response=await fetch('https://api.spendpreflight.com/channels/apify/sanctions',{
  method:'POST',redirect:'error',signal:AbortSignal.timeout(30000),headers:{'Content-Type':'application/json'},body:JSON.stringify(signedEnvelope('sanctions',runId,nonce,input,selfTest?'auth_test':'product'))
 });
 proof.remove(nonce);
 if(!response.ok)throw Error('Screening channel unavailable; no address event charged');
 const body=await response.json();
 if(selfTest){
  if(body.self_test?.authorized!==true||body.self_test?.operation!=='sanctions')throw Error('Channel authorization test failed');
  await Actor.setValue('SELFTEST',{passed:true,operation:'sanctions',proof_version:2,scope:'Private-run signed authorization only; no screening or event charged'});
  console.log('Signed channel authorization test passed; no screening or event charged.');
 }else{
  if(!Array.isArray(body.results)||body.results.length!==input.addresses.length)throw Error('Incomplete screening response; no address event charged');
  const count=await deliver(body.results,Actor);
  console.log(`Delivered ${count} address observations; no input or result values logged.`);
 }

}catch{
 console.error('Screening did not complete. Review input, event budget and channel availability; no automatic retry.');
 process.exitCode=1;
}finally{
 if(server)await new Promise(resolve=>server.close(resolve));
 await Actor.exit({exit:false});
}
