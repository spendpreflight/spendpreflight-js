import {createPrivateKey,createPublicKey,createHash,sign} from 'node:crypto';
export const proofMessage=(operation,runId,nonce,digest,a)=>JSON.stringify(['SpendPreflight/Apify/v2',operation,runId,nonce,digest,a.actor_id,a.build_id,a.started_at,a.container_url,a.issued_at,a.mode,a.key_id]);
export function signedEnvelope(operation,runId,nonce,input,mode='product',env=process.env,now=Date.now()){
 if(env.ACTOR_PERMISSION_LEVEL!=='LIMITED_PERMISSIONS'||env.ACTOR_RUN_ID!==runId)throw Error('Restricted official runtime required');
 if(!/^[A-Za-z0-9]{17}$/.test(env.ACTOR_ID??'')||!/^[A-Za-z0-9]{17}$/.test(env.ACTOR_BUILD_ID??'')||!['product','auth_test'].includes(mode))throw Error('Missing runtime identity');
 const started=Date.parse(env.ACTOR_STARTED_AT);if(!Number.isFinite(started)||started>now+60000||now-started>600000)throw Error('Invalid runtime timing');
 const u=new URL(env.ACTOR_WEB_SERVER_URL);if(u.pathname!=='/'||u.search||u.hash||u.username||u.password||u.port||!/^https:\/\/[a-z0-9]+\.runs\.apify\.net$/.test(u.origin))throw Error('Invalid runtime web server');
 // Application key only: generated in CI and stored encrypted in this Actor's runtime settings.
 // Never send this key, an Apify API token or an RPC credential to the backend.
 const key=createPrivateKey({key:Buffer.from(env.SPENDPREFLIGHT_CHANNEL_PRIVATE_KEY??'','base64'),type:'pkcs8',format:'der'});
 if(key.asymmetricKeyType!=='ed25519')throw Error('Invalid application signing key');
 const spki=createPublicKey(key).export({type:'spki',format:'der'}),keyId=createHash('sha256').update(spki).digest('hex').slice(0,16);
 const digest=createHash('sha256').update(JSON.stringify(input)).digest('hex');
 const attestation={version:2,actor_id:env.ACTOR_ID,build_id:env.ACTOR_BUILD_ID,started_at:env.ACTOR_STARTED_AT,container_url:u.origin,issued_at:now,mode,key_id:keyId};
 const signature=sign(null,Buffer.from(proofMessage(operation,runId,nonce,digest,attestation)),key).toString('base64url');
 return {run_id:runId,nonce,input,attestation:{...attestation,signature}};
}
