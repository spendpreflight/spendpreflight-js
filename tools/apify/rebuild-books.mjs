// Rebuild only the two existing Books Actors. No runs, env-var reads/writes,
// pricing, payout, publication, authentication or test-exemption changes.
const products={
 receipt:{id:'Q6mFhTZ1lbt6eNA0P',name:'usdc-payment-receipt-base',event:'receipt-created',price:0.005},
 statement:{id:'Cb9T1AqAIr19SP8yp',name:'usdc-wallet-statement-base',event:'statement-created',price:0.05}
};
const metadata=a=>JSON.stringify({pricing:a.pricingInfos,defaults:a.defaultRunOptions,permission:a.actorPermissionLevel,public:a.isPublic});

export async function rebuildBooks({operation,actor,expectedBuildId,sourceFiles,request,record,wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))}){
 const p=products[operation];
 if(!p||actor.id!==p.id||actor.username!=='spendpreflight'||actor.name!==p.name||actor.isPublic!==true||!/^[A-Za-z0-9]{17}$/.test(expectedBuildId??'')||actor.taggedBuilds?.latest?.buildId!==expectedBuildId)throw Error('Exact existing public Books Actor/build required');
 const pricing=actor.pricingInfos?.at(-1),events=pricing?.pricingPerEvent?.actorChargeEvents;
 if(pricing?.pricingModel!=='PAY_PER_EVENT'||events?.[p.event]?.eventPriceUsd!==p.price||Object.entries(events??{}).some(([key,value])=>key!==p.event&&(value.eventPriceUsd??0)>0))throw Error('Existing pricing differs; no mutation');
 if(!Array.isArray(sourceFiles)||!sourceFiles.length||sourceFiles.some(f=>f.format!=='TEXT'||typeof f.content!=='string'||!/^((?:src|\.actor)\/[\w.-]+|package(?:-lock)?\.json|config\.json|Dockerfile|\.dockerignore|README\.md)$/.test(f.name)||f.content.includes('BEGIN PRIVATE KEY')))throw Error('Unexpected build source');
 const before=metadata(actor),base='/actors/'+p.id;
 record({state:'SOURCE_UPDATE_INTENT'});
 await request('PUT',base+'/versions/0.1',{sourceType:'SOURCE_FILES',sourceFiles});
 record({state:'SOURCE_UPDATED_BUILD_INTENT'});
 let build=await request('POST',base+'/builds?version=0.1&tag=latest&waitForFinish=60');
 record({state:'BUILD_STARTED',build_id:build.id,build_status:build.status});
 if(!/^[A-Za-z0-9]{17}$/.test(build.id??''))throw Error('Build identity missing; inspect saved intent');
 const terminal=new Set(['SUCCEEDED','FAILED','ABORTED','TIMED-OUT']);
 for(let n=0;!terminal.has(build.status)&&n<30;n++){
  await wait(5000);build=await request('GET','/actor-builds/'+build.id);
 }
 record({build_status:build.status,build_number:build.buildNumber});
 if(build.status!=='SUCCEEDED'||!/^\d+\.\d+\.\d+$/.test(build.buildNumber??''))throw Error('Saved rebuild did not succeed; inspect, never rebuild blindly');
 const after=await request('GET',base);
 if(after.id!==actor.id||after.name!==actor.name||after.username!==actor.username||after.taggedBuilds?.latest?.buildId!==build.id||metadata(after)!==before)throw Error('Build tag or unrelated Actor metadata changed');
 return {state:'REBUILT_NO_RUNS_METADATA_UNCHANGED',build_id:build.id,build_number:build.buildNumber,verification_starts:0};
}
