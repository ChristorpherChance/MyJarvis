import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';

const require=createRequire(import.meta.url);
const basePath=resolve(import.meta.dirname,'../../../docs/openapi-v1-planned.json');
const source=JSON.parse(readFileSync(basePath,'utf8'));
const updater=require('../../../scripts/update-family-contract.cjs');
const familyUpdater=require('../../../scripts/extend-family-contract.cjs');
const clone=<T>(v:T):T=>structuredClone(v);

test('narrow persona-time updater is idempotent and changes only start/end schema',()=>{
 const before=clone(source),first=updater(clone(source)),second=updater(clone(first));
 assert.deepEqual(second,first);
 for(const [name,schema] of Object.entries(before.components.schemas as Record<string,unknown>))if(name!=='PersonasSavePayload')assert.deepEqual(first.components.schemas[name],schema,`unrelated schema changed: ${name}`);
 assert.deepEqual(first.paths,before.paths);
 const payload=first.components.schemas.PersonasSavePayload;
 assert.deepEqual(payload.properties.start,payload.properties.end);
 assert.equal(payload.allOf.length,2);
});

test('backward-compatible family extender retains original unrelated contract fields',()=>{
 const before=clone(source),first=familyUpdater(clone(source)),second=familyUpdater(clone(first));
 assert.deepEqual(second,first);
 assert.deepEqual(first.components.schemas.Memory.properties.cleanupStatus,before.components.schemas.Memory.properties.cleanupStatus);
 assert.deepEqual(first.components.schemas.PiScenario,before.components.schemas.PiScenario);
 assert.deepEqual(first.components.schemas.PersonasSavePayload.properties.start,first.components.schemas.PersonasSavePayload.properties.end);
});
