import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseInput} from '../src/channel.mjs';

const read=path=>JSON.parse(readFileSync(new URL(path,import.meta.url),'utf8'));
const products=read('../../../tools/apify/products.json');
function defaultInput(operation){
 const schema=read('../../'+operation+'/.actor/input_schema.json');
 const input=Object.fromEntries(Object.entries(schema.properties).flatMap(([key,value])=>
  value.prefill!==undefined?[[key,value.prefill]]:value.default!==undefined?[[key,value.default]]:[]));
 for(const key of schema.required)assert.ok(key in input,'Missing required test default: '+key);
 assert.deepEqual(schema.properties,products[operation].input,'Generated schema must match its source manifest');
 return input;
}
test('Receipt automated-test defaults select a real historical lookup rather than empty input',()=>{
 assert.throws(()=>parseInput({},'receipt'));
 const input=defaultInput('receipt');
 assert.deepEqual(Object.keys(input),['tx_hash']);
 assert.notEqual(input.tx_hash,'0x'+'0'.repeat(64));
 assert.doesNotThrow(()=>parseInput(input,'receipt'));
});
test('Statement automated-test defaults satisfy required fields with a narrow past range',()=>{
 assert.throws(()=>parseInput({},'statement'));
 const input=defaultInput('statement');
 assert.deepEqual(Object.keys(input),['address','start','end']);
 assert.notEqual(input.address,'0x'+'0'.repeat(40));
 assert.equal(Date.parse(input.end)-Date.parse(input.start),60000);
 assert.doesNotThrow(()=>parseInput(input,'statement',Date.parse('2026-10-31T00:00:00Z')));
});
