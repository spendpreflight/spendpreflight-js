import {test} from 'node:test';import assert from 'node:assert/strict';import {generateKeyPairSync,createHash,verify} from 'node:crypto';import {readFileSync} from 'node:fs';
import {signedEnvelope,proofMessage} from '../src/attestation.mjs';
const now=Date.parse('2026-10-28T01:00:00Z'),runId='R'.repeat(17),nonce='a'.repeat(64),input={address:'0x'+'0'.repeat(40)};
const pair=generateKeyPairSync('ed25519'),env={ACTOR_PERMISSION_LEVEL:'LIMITED_PERMISSIONS',ACTOR_RUN_ID:runId,ACTOR_ID:'A'.repeat(17),ACTOR_BUILD_ID:'B'.repeat(17),ACTOR_STARTED_AT:new Date(now-1000).toISOString(),ACTOR_WEB_SERVER_URL:'https://fixture.runs.apify.net/',SPENDPREFLIGHT_CHANNEL_PRIVATE_KEY:pair.privateKey.export({format:'der',type:'pkcs8'}).toString('base64')};
test('signs only bound public runtime claims; API and application credentials never enter the envelope',()=>{
 const e=signedEnvelope('token',runId,nonce,input,'product',{...env,APIFY_TOKEN:'never-forward-this'},now),a=e.attestation;
 const digest=createHash('sha256').update(JSON.stringify(input)).digest('hex');
 const bytes=Buffer.from(proofMessage('token',runId,nonce,digest,a));
 assert.equal(verify(null,bytes,pair.publicKey,Buffer.from(a.signature,'base64url')),true);
 for(const changed of [['receipt',runId,nonce,digest,a],['token',runId,nonce+'1',digest,a],['token',runId,nonce,digest,{...a,mode:'auth_test'}]])assert.equal(verify(null,Buffer.from(proofMessage(...changed)),pair.publicKey,Buffer.from(a.signature,'base64url')),false);
 assert.doesNotMatch(JSON.stringify(e),/never-forward-this|PRIVATE_KEY|privateKey|pkcs8/);
});
test('refuses missing keys, permission elevation, stale runtime identity and foreign container origins',()=>{
 for(const bad of [{SPENDPREFLIGHT_CHANNEL_PRIVATE_KEY:''},{ACTOR_PERMISSION_LEVEL:'FULL_PERMISSIONS'},{ACTOR_RUN_ID:'other'},{ACTOR_STARTED_AT:'2020-01-01T00:00:00Z'},{ACTOR_WEB_SERVER_URL:'https://127.0.0.1/'},{ACTOR_WEB_SERVER_URL:'https://fixture.runs.apify.net.evil.test/'}])assert.throws(()=>signedEnvelope('token',runId,nonce,input,'product',{...env,...bad},now));
});
test('standalone Sanctions and paid runtimes use the same signing protocol',()=>{assert.equal(readFileSync(new URL('../src/attestation.mjs',import.meta.url),'utf8'),readFileSync(new URL('../../sanctions/src/attestation.mjs',import.meta.url),'utf8'));});
