// CI-only application authentication repair. No API credential leaves this runner.
import {generateKeyPairSync,createHash} from 'node:crypto';
import {readFileSync,writeFileSync,readdirSync,statSync} from 'node:fs';
import {join,relative} from 'node:path';
import {stageProduct} from './stage-product.mjs';
const products=JSON.parse(readFileSync('tools/apify/products.json','utf8'));
const actors={sanctions:{actor:'crypto-address-sanctions-screener',id:'hNJhO0occ4FYdhUyx',event:'address-screened',price:0.003,example:{addresses:['0x'+'0'.repeat(40)]}},...Object.fromEntries(Object.entries(products).map(([k,p])=>[k,{...p,id:({lint:'FbMeGePsoq306s2Dd',receipt:'Q6mFhTZ1lbt6eNA0P',statement:'Cb9T1AqAIr19SP8yp',token:'mYL8X3MyQXEN7XZ3S'})[k]}]))};
const phase=process.env.CHANNEL_AUTH_PHASE,operation=process.env.CHANNEL_AUTH_PRODUCT;
if(!process.env.APIFY_TOKEN||process.env.GITHUB_REF!=='refs/heads/main'||!['prepare','repair','verify'].includes(phase)||!['all',...Object.keys(actors)].includes(operation))throw Error('Fixed CI phase/product required');
const expected=JSON.parse(process.env.CHANNEL_AUTH_EXPECTED_BUILDS||'{}');
const journal={at:new Date().toISOString(),phase,products:[],public_keys:{},state:'STARTED'};
const save=()=>writeFileSync('apify-channel-auth.json',JSON.stringify(journal,null,2)+'\n');save();
async function request(method,path,body){
 const r=await fetch('https://api.apify.com/v2'+path,{method,redirect:'error',signal:AbortSignal.timeout(30000),headers:{Authorization:'Bearer '+process.env.APIFY_TOKEN,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
 const v=await r.json().catch(()=>null);if(!r.ok){const e=Error('Platform operation failed');e.status=r.status;e.code=/^[a-z-]{1,100}$/.test(v?.error?.type??'')?v.error.type:'unknown';throw e;}return v?.data??v;
}
function files(dir,root=dir){return readdirSync(dir).sort().flatMap(name=>{const path=join(dir,name);if(['node_modules','storage','.git'].includes(name))return [];return statSync(path).isDirectory()?files(path,root):[{name:relative(root,path).replaceAll('\\','/'),format:'TEXT',content:readFileSync(path,'utf8')}];});}
const user=await request('GET','/users/me');if(user.username!=='spendpreflight')throw Error('Wrong account');
for(const op of operation==='all'?Object.keys(actors):[operation]){
 const p=actors[op],base='/actors/'+p.id,version=base+'/versions/0.1',entry={operation:op,actor_id:p.id,state:'STARTED'};journal.products.push(entry);save();
 try{
  const a=await request('GET',base);entry.previous_build=a.taggedBuilds?.latest?.buildId;
  if(a.username!=='spendpreflight'||a.name!==p.actor||!a.isPublic||entry.previous_build!==expected[op])throw Error('Exact owned public Actor/build required');
  const pricing=a.pricingInfos?.at(-1),events=pricing?.pricingPerEvent?.actorChargeEvents;
  if(pricing?.pricingModel!=='PAY_PER_EVENT'||events?.[p.event]?.eventPriceUsd!==p.price||Object.entries(events??{}).some(([k,v])=>k!==p.event&&(v.eventPriceUsd??0)>0))throw Error('Approved pricing changed');
  // Partial PUT preserves all unrelated settings. Never apply runtime variables to image builds.
  if(phase==='prepare')await request('PUT',version,{applyEnvVarsToBuild:false});
  const vars=(await request('GET',version+'/env-vars')).items??[];
  const secret=vars.find(v=>v.name==='SPENDPREFLIGHT_CHANNEL_PRIVATE_KEY'),pub=vars.find(v=>v.name==='SPENDPREFLIGHT_CHANNEL_PUBLIC_KEY');
  let publicKey;
  if(!secret&&!pub&&phase==='prepare'){
   const pair=generateKeyPairSync('ed25519'),spki=pair.publicKey.export({format:'der',type:'spki'});
   publicKey={actor_id:p.id,key_id:createHash('sha256').update(spki).digest('hex').slice(0,16),spki:spki.toString('base64')};
   journal.public_keys[p.actor]=publicKey;entry.key_id=publicKey.key_id;entry.state='KEY_CREATE_INTENT';save();
   // Private bytes exist only in runner memory and the encrypted runtime variable. No artifact/log/build.
   await request('POST',version+'/env-vars',{name:'SPENDPREFLIGHT_CHANNEL_PRIVATE_KEY',value:pair.privateKey.export({format:'der',type:'pkcs8'}).toString('base64'),isSecret:true});
   await request('POST',version+'/env-vars',{name:'SPENDPREFLIGHT_CHANNEL_PUBLIC_KEY',value:JSON.stringify(publicKey),isSecret:false});
  }else{
   if(!secret||!pub||secret.isSecret!==true||secret.value!==undefined||pub.isSecret===true)throw Error('Partial or unsafe application-key configuration; inspect, never rotate blindly');
   publicKey=JSON.parse(pub.value);
  }
  if(publicKey.actor_id!==p.id||!/^[a-f0-9]{16}$/.test(publicKey.key_id)||typeof publicKey.spki!=='string')throw Error('Public key identity mismatch');
  const verifyVars=(await request('GET',version+'/env-vars')).items??[],privateMeta=verifyVars.find(v=>v.name==='SPENDPREFLIGHT_CHANNEL_PRIVATE_KEY');
  if(privateMeta?.isSecret!==true||privateMeta.value!==undefined)throw Error('Encrypted runtime key not verified');
  journal.public_keys[p.actor]=publicKey;entry.key_id=publicKey.key_id;entry.state='RUNTIME_KEY_READY';save();
  if(phase==='prepare')continue;
  let build;
  if(phase==='repair'){
  const dir=op==='sanctions'?'actors/sanctions':stageProduct(op),source=files(dir).filter(f=>!f.name.startsWith('test/'));
  if(source.some(f=>f.content.includes('BEGIN PRIVATE KEY')))throw Error('Private key must never enter source');
  await request('PUT',version,{sourceType:'SOURCE_FILES',sourceFiles:source,applyEnvVarsToBuild:false});entry.state='SOURCE_UPDATED_BUILD_INTENT';save();
  // Exactly one new authentication-repair build; never recreate or retry an ambiguous intent.
  build=await request('POST',base+'/builds?version=0.1&tag=latest&waitForFinish=60');entry.build_id=build.id;entry.state='BUILD_STARTED';save();
  let b=build;for(let n=0;!['SUCCEEDED','FAILED','ABORTED','TIMED-OUT'].includes(b.status)&&n<30;n++){await new Promise(r=>setTimeout(r,5000));b=await request('GET','/actor-builds/'+build.id);}
  entry.build_status=b.status;save();if(b.status!=='SUCCEEDED')throw Error('Repair build not successful; inspect saved ID');
  }else{build=await request('GET','/actor-builds/'+entry.previous_build);if(build.status!=='SUCCEEDED')throw Error('Saved build not successful');entry.build_id=build.id;entry.build_status=build.status;}
  if(!/^\d+\.\d+\.\d+$/.test(build.buildNumber??''))throw Error('Exact build number required for run selector');
  entry.build_number=build.buildNumber;entry.state='AUTH_TEST_INTENT';save();
  const run=await request('POST',base+'/runs?build='+encodeURIComponent(build.buildNumber)+'&memory=128&timeout=90&waitForFinish=60',{...p.example,_self_test:true});entry.run_id=run.id;entry.run_status=run.status;save();
  let r=run;for(let n=0;!['SUCCEEDED','FAILED','ABORTED','TIMED-OUT'].includes(r.status)&&n<18;n++){await new Promise(q=>setTimeout(q,5000));r=await request('GET','/actor-runs/'+run.id);}
  entry.run_status=r.status;save();if(r.status!=='SUCCEEDED'||r.buildId!==build.id)throw Error('Authentication-only run failed; inspect ID, no replay');
  const proof=await request('GET','/key-value-stores/'+r.defaultKeyValueStoreId+'/records/SELFTEST');
  if(proof.passed!==true||proof.operation!==op||proof.proof_version!==2)throw Error('Signed authorization receipt missing');
  const after=await request('GET',base);if(!after.isPublic||after.taggedBuilds?.latest?.buildId!==build.id||after.pricingInfos?.at(-1)?.pricingPerEvent?.actorChargeEvents?.[p.event]?.eventPriceUsd!==p.price)throw Error('Final Actor metadata changed');
  entry.state='AUTHENTICATION_VERIFIED';entry.scope='One new signed auth-only platform run; no product/chain/target lookup, dataset output or charged event';save();
 }catch(e){entry.state='BLOCKED_INSPECT_SAVED_INTENT';entry.error={status:e.status??null,code:e.code??'guard'};save();break;}
}
journal.state=journal.products.some(p=>p.state.startsWith('BLOCKED'))?'BLOCKED':'COMPLETE';save();console.log(JSON.stringify({state:journal.state,phase,products:journal.products.map(p=>({operation:p.operation,state:p.state}))}));if(journal.state==='BLOCKED')process.exitCode=1;
