import {Actor} from 'apify';
import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import {parseInput,proofRegistry,deliver} from './channel.mjs';
import {signedEnvelope} from './attestation.mjs';
import {failureLine} from './diagnostics.mjs';
const config=JSON.parse(readFileSync(new URL('../config.json',import.meta.url),'utf8'));
await Actor.init();let server;const diagnostic={stage:'read_input'};
try{
 const raw=await Actor.getInput();await Actor.setValue('INPUT',null);
 const selfTest=raw?._self_test===true;
 const candidate=selfTest?Object.fromEntries(Object.entries(raw).filter(([k])=>k!=='_self_test')):raw;
 diagnostic.stage='input_validation';
 const input=parseInput(candidate,config.operation),runId=Actor.getEnv().actorRunId;
 diagnostic.stage='runtime_identity';
 if(!runId)throw Error('Requires an Apify limited-permission run');
 diagnostic.stage='proof_server';
 const proof=proofRegistry(config.operation);server=createServer(proof.handler);
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(Number(process.env.ACTOR_WEB_SERVER_PORT??process.env.APIFY_CONTAINER_PORT??4321),'0.0.0.0',resolve);});
 const nonce=proof.add(input);
 diagnostic.stage='application_signing';
 const envelope=signedEnvelope(config.operation,runId,nonce,input,selfTest?'auth_test':'product');
 diagnostic.stage='channel_request';
 const response=await fetch('https://api.spendpreflight.com/channels/apify/'+config.operation,{method:'POST',redirect:'error',signal:AbortSignal.timeout(120000),headers:{'Content-Type':'application/json'},body:JSON.stringify(envelope)});
 proof.remove(nonce);
 if(!response.ok){const failure=await response.json().catch(()=>({}));diagnostic.http_status=response.status;diagnostic.channel_stage=failure.failure_stage;diagnostic.code=failure.failure_code;throw Error('Product unavailable; no result event charged');}
 diagnostic.stage='response_validation';
 const body=await response.json();
 if(selfTest){
  if(body.self_test?.authorized!==true||body.self_test?.operation!==config.operation)throw Error('Channel authorization test failed');
  await Actor.setValue('SELFTEST',{passed:true,operation:config.operation,proof_version:2,scope:'Private-run signed authorization only; no product lookup, chain query or event charged'});
  console.log('Signed channel authorization test passed; no product lookup or event charged.');
 }else{
  if(!body.result||typeof body.result!=='object')throw Error('Invalid response');
  diagnostic.stage='result_delivery';
  const delivered=await deliver(body.result,config,Actor);
  if(!delivered)throw Error('Event budget exhausted; no result delivered.');
  console.log('One result delivered; no query/result values logged.');
 }

}catch{console.error(failureLine(diagnostic));process.exitCode=1;}
finally{if(server)await new Promise(resolve=>server.close(resolve));await Actor.exit({exit:false});}
