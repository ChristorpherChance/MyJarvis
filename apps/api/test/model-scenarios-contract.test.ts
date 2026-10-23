import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import {modelScenarios} from '../src/pi-routing.js';
const require=createRequire(import.meta.url);
const {names,update}=require('../../../scripts/model-scenarios-contract.cjs');
test('model scenario contract includes every runtime scenario and narrow update is repeatable',async()=>{
 const doc=JSON.parse(await readFile(new URL('../../../docs/openapi-v1-planned.json',import.meta.url),'utf8'));
 assert.deepEqual(names,modelScenarios.map(s=>s.id));
 const before=structuredClone(doc),changed=update(structuredClone(doc));
 assert.deepEqual(update(structuredClone(changed)),changed);
 const allowed=new Set(['PiScenario','PiModelSettings','PiDefaultModelResult','PiRoutes','PiConnectionCheckInput']);
 for(const [name,schema] of Object.entries(before.components.schemas))if(!allowed.has(name))assert.deepEqual(changed.components.schemas[name],schema,name);
 for(const name of ['PiModelSettings','PiDefaultModelResult']){
  const scenarios=changed.components.schemas[name].properties.routing.properties.scenarios;
  assert.equal(scenarios.minItems,modelScenarios.length);assert.equal(scenarios.maxItems,modelScenarios.length);
 }
 assert.deepEqual(changed.components.schemas.PiScenario.properties.id.enum,names);
 assert.deepEqual(doc,changed,'committed schema must already match the narrow updater');
});
