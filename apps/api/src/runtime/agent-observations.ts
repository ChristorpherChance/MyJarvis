import {open,realpath,lstat} from 'node:fs/promises';
import {isAbsolute,resolve,relative} from 'node:path';
import {randomUUID} from 'node:crypto';
import type {ExecutionNodeConfig} from './execution-types.js';
import {redactExecutionLog} from './execution-runtime.js';

async function allowedFile(path:string,roots:string[]){
 if(!isAbsolute(path))throw Error('OBSERVATION_FILE_MUST_BE_ABSOLUTE');
 const actual=await realpath(path);if(actual!==resolve(path))throw Error('OBSERVATION_FILE_LINK_REJECTED');
 const allowed=await Promise.all(roots.map(r=>realpath(r)));
 if(!allowed.some(root=>{const part=relative(root,actual);return !!part&&!part.startsWith('..')&&!isAbsolute(part);}))throw Error('OBSERVATION_FILE_OUTSIDE_LOCAL_ALLOWLIST');
 const before=await lstat(actual);const handle=await open(actual,'r');try{const info=await handle.stat(),after=await lstat(actual);if(!info.isFile()||before.isSymbolicLink()||after.isSymbolicLink()||before.ino!==info.ino||after.ino!==info.ino||before.dev!==info.dev||after.dev!==info.dev||await realpath(path)!==actual)throw Error('OBSERVATION_FILE_CHANGED');return {handle,info};}catch(e){await handle.close();throw e;}
}
/** Forward only fresh readings from an independently configured collector; never derives watts from CPU. */
export async function readHardwareFiles(config:ExecutionNodeConfig,policies:any){
 const metrics:Record<string,number>={},metricSources:Record<string,string>={},metricMeasuredAt:Record<string,string>={};
 for(const reader of config.hardwareReadings??[]){const source=policies.hardwareSources?.find((s:any)=>s.id===reader.sourceId&&s.field===reader.field&&s.machineId===config.machineId&&s.enabled);if(!source)continue;
  const {handle,info}=await allowedFile(reader.path,config.workspaceRoots);try{if(info.size>4096)throw Error('HARDWARE_FILE_TOO_LARGE');const bytes=Buffer.alloc(Number(info.size));const result=await handle.read(bytes,0,bytes.length,0),data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes.subarray(0,result.bytesRead)));
   if(Object.keys(data).some(k=>!['value','unit','measuredAt','adapterId'].includes(k)))throw Error('HARDWARE_FILE_FIELDS_INVALID');const age=Date.now()-Date.parse(data.measuredAt);if(!Number.isFinite(age)||age>30000||age< -10000)continue;
   if(data.adapterId!==source.adapterId||data.unit!==(reader.field==='gpuPercent'?'%':'W')||typeof data.value!=='number'||!Number.isFinite(data.value)||data.value<0||data.value>=10000000||reader.field==='gpuPercent'&&data.value>100)throw Error('HARDWARE_READING_INVALID');
   metrics[reader.field]=data.value;metricSources[reader.field]=source.id;metricMeasuredAt[reader.field]=new Date(data.measuredAt).toISOString();
  }finally{await handle.close();}
 }
 return {metrics,metricSources,metricMeasuredAt,observationVersion:policies.version};
}
/** Bounded UTF-8 line tail. Local and server policy must name the same file. */
export async function collectServiceLogFiles(config:ExecutionNodeConfig,policies:any,send:(body:any)=>Promise<any>,persist?:()=>Promise<void>){
 let changed=0;
 for(const file of config.serviceLogs??[]){const source=policies.logSources?.find((s:any)=>s.id===file.sourceId&&s.machineId===config.machineId&&s.enabled&&s.consent);if(!source)continue;if(resolve(source.path)!==resolve(file.path))throw Error('SERVICE_LOG_FILE_POLICY_MISMATCH');
  const {handle,info}=await allowedFile(file.path,config.workspaceRoots);try{
   const identity=`${info.dev}:${info.ino}:${info.birthtimeMs}`;if(!file.streamId||file.fileIdentity!==identity||Number(file.offset??0)>info.size){const first=!file.streamId;file.streamId=randomUUID();file.fileIdentity=identity;file.offset=first&&!file.fromStart?info.size:0;file.discarding=false;if(persist)await persist();changed++;}
   const offset=file.offset??0;if(!Number.isSafeInteger(offset)||offset<0)throw Error('SERVICE_LOG_OFFSET_INVALID');const bytes=Buffer.alloc(65536),read=await handle.read(bytes,0,bytes.length,offset),buffer=bytes.subarray(0,read.bytesRead);
   let cursor=0,discarding=!!file.discarding;const entries:{offset:number;text:string}[]=[];
   while(cursor<buffer.length&&entries.length<100){const end=buffer.indexOf(10,cursor);if(end<0)break;const length=end-cursor;if(!discarding&&length>0&&length<=16000){const text=new TextDecoder('utf-8',{fatal:true}).decode(buffer.subarray(cursor,end)).replace(/\r$/,'');if(text.length)entries.push({offset:offset+cursor,text:redactExecutionLog(text).slice(0,16000)});}discarding=false;cursor=end+1;}
   // Oversized lines are discarded until their newline, so secret fragments cannot be exposed.
   if(entries.length<100&&buffer.length-cursor>=16000){cursor=buffer.length;discarding=true;}
   if(entries.length)await send({requestId:randomUUID(),sourceId:source.id,sourceVersion:policies.version,streamId:file.streamId,entries});
   if(cursor){file.offset=offset+cursor;file.discarding=discarding;changed++;}
  }finally{await handle.close();}
 }
 return changed;
}
