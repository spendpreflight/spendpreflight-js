import {Actor} from 'apify';
import {createServer} from 'node:http';
import {parseInput,proofRegistry,deliver} from './channel.mjs';
await Actor.init();
let server;
try{
 const raw=await Actor.getInput();
 // The runtime reads INPUT once; no input values or results enter logs.
 await Actor.setValue('INPUT',null);
 const input=parseInput(raw);
 const runId=Actor.getEnv().actorRunId;
 if(!runId)throw Error('Run on Apify with limited permissions');
 const proof=proofRegistry();server=createServer(proof.handler);
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(Number(process.env.ACTOR_WEB_SERVER_PORT??process.env.APIFY_CONTAINER_PORT??4321),'0.0.0.0',resolve);});
 const nonce=proof.add(input);
 const response=await fetch('https://api.spendpreflight.com/channels/apify/sanctions',{
  method:'POST',redirect:'error',signal:AbortSignal.timeout(30000),headers:{'Content-Type':'application/json'},body:JSON.stringify({run_id:runId,nonce,input})
 });
 proof.remove(nonce);
 if(!response.ok)throw Error('Screening channel unavailable; no address event charged');
 const body=await response.json();
 if(!Array.isArray(body.results)||body.results.length!==input.addresses.length)throw Error('Incomplete screening response; no address event charged');
 const count=await deliver(body.results,Actor);
 console.log(`Delivered ${count} address observations; no input or result values logged.`);
}catch{
 console.error('Screening did not complete. Review input, event budget and channel availability; no automatic retry.');
 process.exitCode=1;
}finally{
 if(server)await new Promise(resolve=>server.close(resolve));
 await Actor.exit({exit:false});
}
