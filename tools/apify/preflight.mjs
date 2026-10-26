// CI only. Capture CLI output; never print API responses, environment or credentials.
import {writeFileSync} from 'node:fs';
async function get(path) {
  const response=await fetch('https://api.apify.com'+path,{headers:{Authorization:'Bearer '+process.env.APIFY_TOKEN},redirect:'error',signal:AbortSignal.timeout(20_000)});
  if(!response.ok) {
    const body=await response.json().catch(()=>null);
    const code=body?.error?.type;
    const safeCode=typeof code==='string'&&/^[a-z-]{1,80}$/.test(code)?code:'unknown';
    throw new Error(`Apify metadata HTTP ${response.status} (${safeCode}); raw response suppressed`);
  }
  const v=await response.json(); return v.data??v;
}
if(!process.env.APIFY_TOKEN) throw new Error('APIFY_TOKEN secret is missing');
const me=await get('/v2/users/me');
if(me.username!=='spendpreflight') throw new Error('Expected the spendpreflight Apify account');
const list=await get('/v2/acts?my=true&limit=100');
const result={checked_at:new Date().toISOString(),username:me.username,
  // Field names and boolean readiness only; no email, billing details or token.
  readiness_fields:Object.fromEntries(Object.entries(me).filter(([k,v])=>/store|publish|payout|verified/i.test(k)&&typeof v==='boolean')),
  readiness_field_names:Object.keys(me).filter(k=>/store|publish|payout|billing|verified|terms/i.test(k)),
  actors:(list.items??[]).map(a=>({id:a.id,name:a.name,isPublic:a.isPublic}))};
writeFileSync('apify-preflight.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result));
