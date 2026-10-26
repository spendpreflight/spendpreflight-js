// Runs only in Actions on tested main. Never log credentials, API bodies or raw CLI output.
import {mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
const name='crypto-address-sanctions-screener',identity='spendpreflight~'+name;
const journal={at:new Date().toISOString(),phase:'private-build',actor:null,state:'STARTED'};
const save=()=>writeFileSync('apify-sanctions-deployment.json',JSON.stringify(journal,null,2)+'\n');
function fail(message){save();throw Error(message);}
async function request(method,path,body){
 const r=await fetch('https://api.apify.com/v2'+path,{method,headers:{Authorization:'Bearer '+process.env.APIFY_TOKEN,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),redirect:'error',signal:AbortSignal.timeout(30000)});
 const value=await r.json().catch(()=>null);
 if(!r.ok){const c=value?.error?.type;journal.state='BLOCKED';journal.error={status:r.status,code:typeof c==='string'&&/^[a-z-]{1,100}$/.test(c)?c:'unknown'};fail('Apify operation blocked: '+JSON.stringify(journal.error));}
 return value.data??value;
}
if(!process.env.APIFY_TOKEN||process.env.GITHUB_REF!=='refs/heads/main')fail('Requires the existing secret on tested main');
const user=await request('GET','/users/me');
if(user.username!=='spendpreflight')fail('Wrong Apify account');
// CLI 1.10 management commands use its auth backend rather than APIFY_TOKEN directly.
// Bind the existing token in the ephemeral runner only; this file is never an artifact.
const authDir=join(homedir(),'.apify'),authPath=join(authDir,'auth.json');
mkdirSync(authDir,{recursive:true,mode:0o700});
writeFileSync(authPath,JSON.stringify({id:user.id,username:user.username,token:process.env.APIFY_TOKEN}),{mode:0o600});
save();
try{
 const owned=await request('GET','/acts?my=true&limit=100');
 const exists=(owned.items??[]).find(a=>a.name===name);
 if(process.env.APIFY_DEPLOY_STAGE==='sanctions-price-existing'){
  if(!exists||!process.env.APIFY_EXPECTED_BUILD_ID)fail('Existing Actor and exact verified build ID are required');
  journal.phase='price-existing';
 }else{
  if(exists)fail('Actor already exists; inspect the receipt and use the pricing-only resume stage rather than rebuilding');
  const command=spawnSync('apify',['push','--dir','actors/sanctions','--wait-for-finish','300'],{encoding:'utf8',timeout:360000,maxBuffer:4_000_000});
  if(command.status!==0){journal.state='CLI_BUILD_FAILED';fail('Apify CLI build failed; raw output suppressed');}
 }
 const actor=await request('GET','/acts/'+identity);
 journal.actor={id:actor.id,name:actor.name,isPublic:actor.isPublic,buildId:actor.taggedBuilds?.latest?.buildId??null};save();
 if(!journal.actor.buildId)fail('No tagged successful build');
 const build=await request('GET','/actor-builds/'+journal.actor.buildId);
 journal.actor.buildStatus=build.status;save();
 if(build.status!=='SUCCEEDED')fail('The tagged build is not successful; do not publish');
 if(process.env.APIFY_DEPLOY_STAGE==='sanctions-price-existing'&&journal.actor.buildId!==process.env.APIFY_EXPECTED_BUILD_ID)fail('The existing Actor build changed; inspect before resuming');
 const definition=JSON.parse(readFileSync('actors/sanctions/.actor/actor.json','utf8'));
 const at=new Date().toISOString();
 // Set the approved price while still PRIVATE. Never publish for free as a workaround.
 const previous=actor.pricingInfos?.at(-1);
 if(previous?.pricingModel==='PAY_PER_EVENT'&&previous.pricingPerEvent?.actorChargeEvents?.['address-screened']?.eventPriceUsd===0.003){journal.state='PRIVATE_BUILT_PRICED_ALREADY';save();console.log(JSON.stringify(journal));}
 else{
 const updated=await request('PUT','/acts/'+identity,{
  title:definition.title,description:definition.description,actorPermissionLevel:'LIMITED_PERMISSIONS',categories:['BUSINESS'],
  defaultRunOptions:{build:'latest',memoryMbytes:128,timeoutSecs:60,restartOnError:false},
  pricingInfos:[{pricingModel:'PAY_PER_EVENT',createdAt:at,startedAt:at,apifyMarginPercentage:0.2,
   pricingPerEvent:{actorChargeEvents:{'address-screened':{eventTitle:'Address screened',eventDescription:'One delivered exact OFAC SDN address observation',eventPriceUsd:0.003,isPrimaryEvent:true}}}}]
 });
 journal.state='PRIVATE_BUILT_PRICED';journal.pricingModel=updated.pricingInfos?.at(-1)?.pricingModel??null;save();
 console.log(JSON.stringify(journal));
 }
}finally{rmSync(authPath,{force:true});}
