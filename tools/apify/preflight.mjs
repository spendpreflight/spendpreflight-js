// CI only. Capture CLI output; never print API responses, environment or credentials.
import {spawnSync} from 'node:child_process';
import {writeFileSync} from 'node:fs';
const cli = process.platform === 'win32' ? 'apify.cmd' : 'apify';
function get(path) {
  const p=spawnSync(cli,['api','GET',path],{encoding:'utf8',maxBuffer:2_000_000});
  if(p.status!==0) throw new Error('Apify metadata request failed (raw response suppressed)');
  try { const v=JSON.parse(p.stdout); return v.data??v; }
  catch { throw new Error('Apify metadata response was not JSON (raw response suppressed)'); }
}
if(!process.env.APIFY_TOKEN) throw new Error('APIFY_TOKEN secret is missing');
const me=get('/v2/users/me');
if(me.username!=='spendpreflight') throw new Error('Expected the spendpreflight Apify account');
const list=get('/v2/acts?my=true&limit=100');
const result={checked_at:new Date().toISOString(),username:me.username,
  // Field names and boolean readiness only; no email, billing details or token.
  readiness_fields:Object.fromEntries(Object.entries(me).filter(([k,v])=>/store|publish|payout|verified/i.test(k)&&typeof v==='boolean')),
  readiness_field_names:Object.keys(me).filter(k=>/store|publish|payout|billing|verified|terms/i.test(k)),
  actors:(list.items??[]).map(a=>({id:a.id,name:a.name,isPublic:a.isPublic}))};
writeFileSync('apify-preflight.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result));
