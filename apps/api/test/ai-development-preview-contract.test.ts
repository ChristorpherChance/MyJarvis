import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),update=require('../../../scripts/ai-development-preview-contract.cjs');
const Ajv=require('ajv/dist/2020').default,formats=require('ajv-formats');

test('AI development preview contract is narrow, idempotent and documents a private read-only GET',async()=>{
 const doc=JSON.parse(await readFile(new URL('../../../docs/openapi-v1-planned.json',import.meta.url),'utf8'));
 assert.deepEqual(update(structuredClone(doc)),doc);assert.deepEqual(update(update(structuredClone(doc))),doc);
 const fixture={components:{schemas:{Unrelated:{const:'keep'}}},paths:{'/unrelated':{get:{operationId:'keep'}},'/api/runtime/ai-development/machines/{id}/preview':{post:{operationId:'future'}}}};
 update(fixture);assert.deepEqual(fixture.components.schemas.Unrelated,{const:'keep'});assert.equal(fixture.paths['/unrelated'].get.operationId,'keep');assert.equal(fixture.paths['/api/runtime/ai-development/machines/{id}/preview'].post.operationId,'future');
 const op=doc.paths['/api/runtime/ai-development/machines/{id}/preview'].get;
 assert.deepEqual(op.security,[{SessionCookie:[]}]);assert.equal(op.requestBody,undefined);assert.equal(op.parameters.length,6);assert(op.parameters.every((p:any)=>p.required));assert.equal(op.responses[200].headers['Cache-Control'].schema.const,'private, no-store');
 const ajv=new Ajv({strict:false});formats(ajv);for(const [name,schema] of Object.entries(doc.components.schemas).filter(([n])=>n.startsWith('AiDevelopmentPreview')))ajv.addSchema(schema,'#/components/schemas/'+name);
 const validate=ajv.getSchema('#/components/schemas/AiDevelopmentPreview');
 const dto={schemaVersion:1,comparisonVersion:1,mode:'supplement',readOnly:true,applySupported:false,machineId:'fixture',machineRevision:1,profile:{id:'fixture',revision:1,hash:'a'.repeat(64)},policyHash:'b'.repeat(64),basisHash:'c'.repeat(64),observation:null,status:'unavailable',reason:'OBSERVATION_UNAVAILABLE',items:[],preserved:['credentials'],notCompared:['compression-policy']};
 assert(validate(dto),JSON.stringify(validate.errors));for(const patch of [{applySupported:true},{readOnly:false},{mode:'execute'},{privateSettings:'secret'},{items:[{category:'provider',key:'p',status:'match',reason:'fixture',intent:'execute',expected:null,observed:null}]}])assert.equal(validate({...dto,...patch}),false);
});
