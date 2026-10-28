// Apify's run endpoint takes a build NUMBER or tag, never the build ID.
export function authRunPath(actorId,build){
 if(!/^[A-Za-z0-9]{17}$/.test(actorId)||build?.status!=='SUCCEEDED'||!/^[A-Za-z0-9]{17}$/.test(build.id??'')||!/^\d+\.\d+\.\d+$/.test(build.buildNumber??''))throw Error('Successful exact build identity and number required');
 return '/actors/'+actorId+'/runs?build='+encodeURIComponent(build.buildNumber)+'&memory=128&timeout=90&waitForFinish=60';
}
