import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {Ajv} from 'ajv';
const require=createRequire(import.meta.url),extend=require('../../../scripts/weather-runtime-contract.cjs');
const rewrite=(value:any):any=>Array.isArray(value)?value.map(rewrite):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([key,item])=>[key,key==='$ref'?String(item).replace('#/components/schemas/','#/definitions/'):rewrite(item)])):value;
test('weather contract declares all seven authenticated operations and rejects forged preference, provider URLs and oversized queries',()=>{
 const contract=extend({components:{schemas:{}},paths:{}}),schemas=contract.components.schemas,operations=Object.values(contract.paths).flatMap((path:any)=>Object.values(path));assert.equal(operations.length,7);assert(operations.every((operation:any)=>operation['x-implementation-status']==='implemented'&&operation.security.length));
 const ajv=new Ajv({strict:false});ajv.addSchema({$id:'weather',definitions:rewrite(schemas)});
 const preference=ajv.compile({$ref:'weather#/definitions/WeatherPreferenceInput'});assert(preference({expectedVersion:0,locationId:'geonames:2950159'}));assert(!preference({expectedVersion:0,locationId:'geonames:2950159',profileId:'another-member'}));assert(!preference({expectedVersion:0,locationId:'http://localhost/private'}));
 const search=ajv.compile({$ref:'weather#/definitions/WeatherSearchInput'});assert(search({query:'柏林',countryCode:'DE'}));assert(!search({query:'柏林',endpoint:'http://localhost'}));assert(!search({query:'x'.repeat(101)}));
 const configuration=ajv.compile({$ref:'weather#/definitions/WeatherSettingsInput'}),input={expectedVersion:0,enabled:true,provider:'open-meteo',cacheMinutes:10,staleMinutes:120,timeoutMs:8000,dailyRequestLimit:500};assert(configuration(input));assert(!configuration({...input,provider:'arbitrary-url'}));assert(!configuration({...input,dailyRequestLimit:10001}));
});
