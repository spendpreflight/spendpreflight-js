import {test} from 'node:test';import assert from 'node:assert/strict';
import {authRunPath} from '../../../tools/apify/run-selector.mjs';
const actorId='A'.repeat(17),build={id:'B'.repeat(17),status:'SUCCEEDED',buildNumber:'0.1.3'};
test('run selector uses the exact successful build number rather than its unrelated API ID',()=>{
 const path=authRunPath(actorId,build),url=new URL(path,'https://api.apify.com/v2');
 assert.equal(url.searchParams.get('build'),'0.1.3');assert.doesNotMatch(path,/B{17}/);assert.equal(url.searchParams.get('timeout'),'90');
});
test('run selector refuses failed, unknown or tag-only builds before run creation',()=>{
 for(const bad of [{status:'FAILED'},{buildNumber:build.id},{buildNumber:'latest'},{buildNumber:undefined},{id:'bad'}])assert.throws(()=>authRunPath(actorId,{...build,...bad}));
});
