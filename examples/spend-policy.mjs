// Offline only: no wallet, target request, API call, signature or payment.
import {createSpendPolicy} from '../dist/index.js';
const payTo='0x1111111111111111111111111111111111111111';
const asset='0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';
const policy=JSON.parse(`{
 "version":1,"dailyCapUsd":0.02,"maxPerCallUsd":0.02,"holdAboveUsd":0.02,
 "merchantAllowlist":["${payTo}"],"merchantBlocklist":[],
 "networkAllowlist":["eip155:8453"],
 "assetAllowlist":[{"network":"eip155:8453","asset":"${asset}"}]
}`);
const requirement={scheme:'exact',network:'eip155:8453',asset,amount:'10000',payTo};
const challenge={x402Version:2,resource:{url:'https://merchant.example/data'},accepts:[requirement]};
const offline=createSpendPolicy(policy);
console.log('Local preview:',offline.evaluate(challenge,requirement).decision);
console.log('Without remote preflight:',(await offline.check(challenge,requirement)).decision);
// A mock demonstrates sequencing; it is NOT a real screening result.
const mock=createSpendPolicy(policy,{remote:{fetch:async()=>Response.json({decision:'allow',reasons:['allow: OFFLINE MOCK ONLY']})}});
for(let i=0;i<3;i++)console.log('Mock reserved decision:',(await mock.check(challenge,requirement)).decision);
// Production integration: construct with explicit remote options and attach once
// to your authorized x402 client BEFORE signing: controller.attach(client).
// A paid screening fetch must use a SEPARATE locally guarded client and budget.
