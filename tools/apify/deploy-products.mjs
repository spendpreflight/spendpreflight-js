// CI only. Token never enters arguments, URLs, source, stdout or artifacts.
import {mkdirSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {homedir} from 'node:os';import {join} from 'node:path';import {spawnSync} from 'node:child_process';
import {stageProduct} from './stage-product.mjs';
const products=JSON.parse(readFileSync('tools/apify/products.json','utf8'));
const phase=process.env.APIFY_PRODUCTS_PHASE,selected=process.env.APIFY_PRODUCT;
if(!['build','configure','publish','inspect'].includes(phase)||!['all','lint','receipt','statement'].includes(selected)||!process.env.APIFY_TOKEN||process.env.GITHUB_REF!=='refs/heads/main')throw Error('Requires fixed product/phase on tested main with existing secret');
const expected=JSON.parse(process.env.APIFY_EXPECTED_BUILDS||'{}');
const journal={at:new Date().toISOString(),phase,products:[],state:'STARTED'};
const save=()=>writeFileSync('apify-products-deployment.json',JSON.stringify(journal,null,2)+'\n');save();
async function request(method,path,body){
 const r=await fetch('https://api.apify.com/v2'+path,{method,headers:{Authorization:'Bearer '+process.env.APIFY_TOKEN,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),redirect:'error',signal:AbortSignal.timeout(30000)});
 const v=await r.json().catch(()=>null);if(!r.ok){const c=v?.error?.type;const err=Error('Apify operation failed');err.status=r.status;err.code=typeof c==='string'&&/^[a-z-]{1,100}$/.test(c)?c:'unknown';throw err;}return v.data??v;
}
const user=await request('GET','/users/me');if(user.username!=='spendpreflight')throw Error('Wrong Apify account');
const auth=join(homedir(),'.apify','auth.json');mkdirSync(join(homedir(),'.apify'),{recursive:true,mode:0o700});writeFileSync(auth,JSON.stringify({id:user.id,username:user.username,token:process.env.APIFY_TOKEN}),{mode:0o600});
try{
 const owned=await request('GET','/acts?my=true&limit=100');
 for(const operation of selected==='all'?['lint','receipt','statement']:[selected]){
  const p=products[operation],identity='spendpreflight~'+p.actor,entry={operation,actor_name:p.actor,price_usd:p.price,state:'STARTED'};journal.products.push(entry);save();
  try{
   const exists=owned.items?.find(a=>a.name===p.actor);
   if(phase==='build'){
    if(exists)throw Error('Actor already exists; inspect and use an exact-build configure/publish phase');
    const dir=stageProduct(operation);
    const result=spawnSync('apify',['push','--dir',dir,'--wait-for-finish','300'],{encoding:'utf8',timeout:360000,maxBuffer:4_000_000});
    if(result.status!==0)throw Error('Official CLI build failed; raw output suppressed');
   }else if(!exists)throw Error('Existing Actor required; never create an alternate');
   let actor=await request('GET','/acts/'+identity),buildId=actor.taggedBuilds?.latest?.buildId;
   entry.actor_id=actor.id;entry.build_id=buildId;entry.isPublic=actor.isPublic;save();
   entry.metrics={observed_at:new Date().toISOString(),lifetime_runs:actor.stats?.totalRuns??null,active_users_7days_including_owner:actor.stats?.totalUsers7Days??null,public_nonowner_run_stats_30days:actor.stats?.publicActorRunStats30Days??null,payouts_usd:null,payout_note:'Unknown: not exposed by supported Actor metadata. Record only an owner-verified payout aggregate, never infer from runs or configured prices.'};save();
   if(!buildId)throw Error('No tagged build');
   const build=await request('GET','/actor-builds/'+buildId);entry.build_status=build.status;save();if(build.status!=='SUCCEEDED')throw Error('Build is not successful');
   if(phase==='inspect'){entry.state='INSPECTED';continue;}
   if(phase!=='build'&&expected[operation]!==buildId)throw Error('Exact expected build ID mismatch or missing; no mutation');
   if(phase==='build'){
    // Public/synthetic fixtures only; no endpoint probe, chain read or paid event.
    const run=await request('POST','/acts/'+identity+'/runs?memory=128&timeout=45&waitForFinish=60',{...p.example,_self_test:true});
    entry.self_test_run=run.id;entry.self_test_status=run.status;save();
    if(run.status!=='SUCCEEDED'||run.buildId!==buildId)throw Error('Operator platform self-test did not succeed; inspect, never replay blindly');
    const check=await request('GET','/key-value-stores/'+run.defaultKeyValueStoreId+'/records/SELFTEST');
    if(check.passed!==true||check.operation!==operation)throw Error('Operator self-test receipt missing');
    entry.self_test_scope='Platform wrapper only; no real lookup or event charged';
   }
   const pricing=actor.pricingInfos?.at(-1),event=pricing?.pricingPerEvent?.actorChargeEvents?.[p.event];
   const ready=pricing?.pricingModel==='PAY_PER_EVENT'&&event?.eventPriceUsd===p.price;
   if(!ready){
    if(actor.isPublic)throw Error('Public pricing differs; do not automatically change it');
    const at=new Date().toISOString();
    actor=await request('PUT','/acts/'+identity,{title:p.title,description:p.description,actorPermissionLevel:'LIMITED_PERMISSIONS',categories:['BUSINESS'],defaultRunOptions:{build:'latest',memoryMbytes:128,timeoutSecs:180,restartOnError:false},pricingInfos:[{pricingModel:'PAY_PER_EVENT',createdAt:at,startedAt:at,apifyMarginPercentage:0.2,pricingPerEvent:{actorChargeEvents:{[p.event]:{eventTitle:'Completed '+operation+' result',eventDescription:'One completed result, not per transfer; no startup fee',eventPriceUsd:p.price,isPrimaryEvent:true}}}}]});
   }
   const actual=actor.pricingInfos?.at(-1),events=actual?.pricingPerEvent?.actorChargeEvents;
   if(actual?.pricingModel!=='PAY_PER_EVENT'||events?.[p.event]?.eventPriceUsd!==p.price||Object.entries(events??{}).some(([k,v])=>k!==p.event&&(v.eventPriceUsd??0)>0))throw Error('Approved event pricing not verified or unexpected extra event charge');
   entry.pricing_ready=true;entry.state='PRIVATE_BUILT_PRICED';save();
   if(phase==='publish'){
    const runs=await request('GET','/acts/'+identity+'/runs?desc=true&limit=20&status=SUCCEEDED');
    if(!runs.items?.some(r=>r.buildId===buildId))throw Error('No successful run for this exact build; inspect before publishing');
    // No legal-terms acceptance, payout/tax endpoint, billing setup or plan change.
    if(!actor.isPublic)actor=await request('PUT','/acts/'+identity,{isPublic:true,title:p.title,categories:['BUSINESS']});
    entry.isPublic=actor.isPublic;if(!actor.isPublic)throw Error('Publication not verified');
    const r=await fetch('https://apify.com/spendpreflight/'+p.actor,{redirect:'error',signal:AbortSignal.timeout(20000)});entry.store_http=r.status;if(!r.ok)throw Error('Store readback failed');entry.state='PUBLIC_STORE_READBACK';
   }
  }catch(e){entry.state='BLOCKED';entry.error={status:e.status??null,code:e.code??'deployment_guard'};entry.action=e.code?'Inspect platform gate; no credential/payout/tax/terms change or free workaround':'Inspect saved build and exact-build guard; no blind retry';}
  save();
 }
 journal.state=journal.products.some(p=>p.state==='BLOCKED')?'BLOCKED_RECORDED':'COMPLETE';save();console.log(JSON.stringify(journal));if(journal.state==='BLOCKED_RECORDED')process.exitCode=1;
}finally{rmSync(auth,{force:true});}
