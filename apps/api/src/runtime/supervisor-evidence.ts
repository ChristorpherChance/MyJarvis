import {createHash} from 'node:crypto';

export const SUPERVISOR_EVIDENCE_MAX_ITEMS=30;
export const SUPERVISOR_EVIDENCE_MAX_ITEM_BYTES=32*1024;
export const SUPERVISOR_EVIDENCE_MAX_TOTAL_BYTES=256*1024;
export interface SupervisorEvidenceReceipt {path:string;sha256:string;size:number;contentBase64:string}
export interface SupervisorEvidenceRef {path:string;sha256:string}
export interface VerifiedSupervisorEvidence {path:string;sha256:string;size:number;content:Buffer;verified:true}
const digest=(data:Uint8Array)=>createHash('sha256').update(data).digest('hex');
const privatePath=/(?:^|\/)(?:\.secrets?|\.jarvis-dev|private|credentials?|\.ssh|\.aws|\.config)(?:\/|$)/i;
const privateContent=/(?:-----BEGIN (?:[A-Z ]*PRIVATE KEY|OPENSSH PRIVATE KEY)-----|\b(?:password|passwd|api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|authorization|cookie|private[_-]?key)\s*[=:]\s*\S+|\bBearer\s+[A-Za-z0-9._~+\/-]{8,}|\bsk-(?:ant-)?[A-Za-z0-9_-]{12,}|\beyJ[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,})/i;
export function supervisorEvidencePath(value:unknown):string {
 if(typeof value!=='string'||value.length<1||value.length>1000||value.startsWith('/')||value.includes('\\')||value.includes('\0'))throw Error('SUPERVISOR_EVIDENCE_PATH_INVALID');
 const parts=value.split('/');if(parts.some(p=>!p||p==='.'||p==='..'||p.startsWith('.'))||privatePath.test(value))throw Error('SUPERVISOR_EVIDENCE_PATH_PRIVATE_OR_INVALID');
 return value;
}
export function validateSupervisorEvidenceReceipts(value:unknown):SupervisorEvidenceReceipt[]{
 if(!Array.isArray(value)||value.length>SUPERVISOR_EVIDENCE_MAX_ITEMS)throw Error('SUPERVISOR_EVIDENCE_COUNT_INVALID');let total=0;const seen=new Set<string>();
 return value.map((raw:any)=>{if(!raw||typeof raw!=='object'||Array.isArray(raw)||Object.keys(raw).sort().join(',')!=='contentBase64,path,sha256,size')throw Error('SUPERVISOR_EVIDENCE_SHAPE_INVALID');const path=supervisorEvidencePath(raw.path);if(seen.has(path))throw Error('SUPERVISOR_EVIDENCE_DUPLICATE_PATH');seen.add(path);if(typeof raw.sha256!=='string'||!/^[a-f0-9]{64}$/.test(raw.sha256)||!Number.isSafeInteger(raw.size)||raw.size<1||raw.size>SUPERVISOR_EVIDENCE_MAX_ITEM_BYTES||typeof raw.contentBase64!=='string'||raw.contentBase64.length>Math.ceil(SUPERVISOR_EVIDENCE_MAX_ITEM_BYTES*4/3)+4||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(raw.contentBase64))throw Error('SUPERVISOR_EVIDENCE_SIZE_OR_ENCODING_INVALID');const content=Buffer.from(raw.contentBase64,'base64');if(content.length!==raw.size||content.toString('base64')!==raw.contentBase64||digest(content)!==raw.sha256)throw Error('SUPERVISOR_EVIDENCE_HASH_MISMATCH');total+=content.length;if(total>SUPERVISOR_EVIDENCE_MAX_TOTAL_BYTES)throw Error('SUPERVISOR_EVIDENCE_TOTAL_SIZE_INVALID');const text=content.toString('utf8');if(Buffer.from(text,'utf8').compare(content)!==0||privateContent.test(text))throw Error('SUPERVISOR_EVIDENCE_PRIVATE_CONTENT');return {path,sha256:raw.sha256,size:raw.size,contentBase64:raw.contentBase64};});
}
/** Validate an immutable signed-run receipt; no filesystem access is performed by the supervisor server. */
export function resolveSupervisorEvidence(receipts:unknown,refs:SupervisorEvidenceRef[]):{items:VerifiedSupervisorEvidence[];missing:{path:string;reason:string}[]}{
 const validated=validateSupervisorEvidenceReceipts(receipts??[]),byPath=new Map(validated.map(r=>[r.path,r])),items:VerifiedSupervisorEvidence[]=[],missing:{path:string;reason:string}[]=[];if(!Array.isArray(refs)||refs.length>SUPERVISOR_EVIDENCE_MAX_ITEMS)throw Error('SUPERVISOR_EVIDENCE_COUNT_INVALID');let total=0;const seen=new Set<string>();
 for(const ref of refs){let path='';try{path=supervisorEvidencePath(ref?.path);if(typeof ref.sha256!=='string'||!/^[a-f0-9]{64}$/.test(ref.sha256)||seen.has(path))throw Error();seen.add(path);}catch{missing.push({path:path||typeof ref?.path==='string'?String(ref?.path??'').slice(0,1000):'',reason:'invalid-reference'});continue;}const receipt=byPath.get(path);if(!receipt){missing.push({path,reason:'receipt-missing'});continue;}if(receipt.sha256!==ref.sha256){missing.push({path,reason:'hash-mismatch'});continue;}const content=Buffer.from(receipt.contentBase64,'base64');total+=content.length;if(total>SUPERVISOR_EVIDENCE_MAX_TOTAL_BYTES){missing.push({path,reason:'total-size'});continue;}items.push({path,sha256:receipt.sha256,size:receipt.size,content,verified:true});}
 return {items,missing};
}
