import {SoftwareFactoryRuntime} from '../apps/api/src/runtime/software-factory-runtime.ts';
import {FACTORY_NODE} from './install-software-factory-node.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
const runtime=new SoftwareFactoryRuntime({identity:{isPrincipalCurrent:()=>true,requireAdmin:()=>{throw Error('NOT_A_HTTP_AUTH_BYPASS')}},machineId:FACTORY_NODE.machineId,sourceProjectId:()=>FACTORY_NODE.projectId,baseURL:'http://192.168.10.101:8080'});
const principal={actorId:'server-admin',profileId:'me',administrator:true},require=createRequire(import.meta.url),apply=require('./software-factory-contract.cjs'),Ajv=require('ajv/dist/2020'),formats=require('ajv-formats'),d={components:{schemas:{}},paths:{}};apply(d);
const ajv=new Ajv({strict:false});formats(ajv);ajv.addSchema({$id:'actual-factory',...d});
const validation=name=>ajv.compile({$ref:'actual-factory#/components/schemas/'+name});
const state=await runtime.state(principal),list=await runtime.projects(principal),details=[];
for(const p of [list.items[0],list.items.find(p=>p.id?.startsWith('00000000-'))].filter(Boolean)){
 const detail=await runtime.project(principal,p.id);
 if(!validation('SoftwareFactoryDetail')(detail))throw Error('ACTUAL_DETAIL_DTO_INVALID');
 details.push({id:detail.project.id,partialErrors:detail.partialErrors,sectionCounts:detail.sectionCounts,usagePresent:detail.usage!==null,strictDtoValid:true});
}
if(!state.connected||!validation('SoftwareFactoryState')(state)||!validation('SoftwareFactoryProjects')(list))throw Error('ACTUAL_FACTORY_CONNECTION_INVALID');
const result={observedAt:new Date().toISOString(),configured:state.configured,connected:state.connected,projectCount:list.total,legacyGuids:list.items.filter(p=>p.id?.startsWith('00000000-')).length,strictDtoValid:true,details,readOnly:true,modelCalled:false,sourceDevelopmentVerified:false,fullAcceptance:false};
await mkdir('artifacts/software-factory/node',{recursive:true});await writeFile('artifacts/software-factory/node/actual-connector-validation.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
