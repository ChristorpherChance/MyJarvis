import { readFileSync } from 'node:fs';
import { resolve,dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { Ajv,type ValidateFunction } from 'ajv';
import { BusinessError } from './types.js';
const require=createRequire(import.meta.url);
const addFormats=require('ajv-formats');
const location=resolve(dirname(fileURLToPath(import.meta.url)),'../../../../docs/openapi-v1-planned.json');
export const plannedContract=JSON.parse(readFileSync(location,'utf8'));
function rewrite(value:any):any {if(Array.isArray(value))return value.map(rewrite);if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,k==='$ref'?String(v).replace('#/components/schemas/','#/definitions/'):rewrite(v)]));return value}
const ajv=new Ajv({allErrors:true,strict:false,removeAdditional:false,coerceTypes:false,useDefaults:false});
addFormats(ajv);ajv.addSchema({$id:'urn:jarvis:v1',definitions:rewrite(plannedContract.components.schemas)});
const cache=new Map<string,ValidateFunction>();
export function validateDto(name:string,body:unknown){const key='dto:'+name;let validate=cache.get(key);if(!validate){validate=ajv.compile({$ref:'urn:jarvis:v1#/definitions/'+name});cache.set(key,validate)}return {valid:!!validate(body),errors:validate.errors};}
export function assertDto(name:string,body:unknown){const result=validateDto(name,body);if(!result.valid)throw new BusinessError('CONTRACT_INVALID','接口返回校验未通过，操作未提交',500,{fields:result.errors?.slice(0,8).map(e=>({path:e.instancePath,rule:e.keyword}))})}
export function assertReceipt(route:string,body:unknown){const ref=plannedContract.paths[route]?.post?.responses?.['200']?.content?.['application/json']?.schema?.$ref;if(ref)assertDto(ref.split('/').at(-1),body)}
export function validateCommand(route:string,body:unknown){
 let validate=cache.get(route);if(!validate){const ref=plannedContract.paths[route]?.post?.requestBody?.content?.['application/json']?.schema?.$ref;if(!ref)throw new BusinessError('NOT_CONFIGURED','此命令的接口尚未开放',503);validate=ajv.compile({$ref:ref.replace('#/components/schemas/','urn:jarvis:v1#/definitions/')});cache.set(route,validate)}
 if(!validate(body))throw new BusinessError('VALIDATION','请检查必填项、范围和数据格式',400,{fields:validate.errors?.slice(0,8).map(e=>({path:e.instancePath,rule:e.keyword}))});
 const whitespace=(value:any):boolean=>typeof value==='string'?value.length>0&&!value.trim():Array.isArray(value)?value.some(whitespace):value&&typeof value==='object'?Object.values(value).some(whitespace):false;
 if(whitespace(body))throw new BusinessError('VALIDATION','填写内容不能只有空格');
}
