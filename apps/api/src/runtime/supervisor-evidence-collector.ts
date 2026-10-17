import {createHash} from 'node:crypto';
import {constants as fsConstants} from 'node:fs';
import {lstat,open,realpath} from 'node:fs/promises';
import {isAbsolute,relative,resolve} from 'node:path';
import {SUPERVISOR_EVIDENCE_MAX_ITEMS,SUPERVISOR_EVIDENCE_MAX_ITEM_BYTES,SUPERVISOR_EVIDENCE_MAX_TOTAL_BYTES,supervisorEvidencePath,validateSupervisorEvidenceReceipts,type SupervisorEvidenceReceipt,type SupervisorEvidenceRef} from './supervisor-evidence.js';

const inside=(root:string,target:string)=>{const p=relative(root,target);return !!p&&!p.startsWith('..')&&!isAbsolute(p)};
const privateContent=/(?:-----BEGIN (?:[A-Z ]*PRIVATE KEY|OPENSSH PRIVATE KEY)-----|\b(?:password|passwd|api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|authorization|cookie|private[_-]?key)\s*[=:]\s*\S+|\bBearer\s+[A-Za-z0-9._~+\/-]{8,}|\bsk-(?:ant-)?[A-Za-z0-9_-]{12,}|\beyJ[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,})/i;

/** Collect only explicitly referenced, bounded, non-private UTF-8 regular files. */
export async function collectSupervisorEvidence(root:string,refs:SupervisorEvidenceRef[],signal?:AbortSignal):Promise<SupervisorEvidenceReceipt[]> {
 if(!Array.isArray(refs)||refs.length>SUPERVISOR_EVIDENCE_MAX_ITEMS)throw Error('SUPERVISOR_EVIDENCE_COUNT_INVALID');
 const workspace=await realpath(root),seen=new Set<string>(),receipts:SupervisorEvidenceReceipt[]=[];let total=0;
 for(const ref of refs){
  if(signal?.aborted)throw Error('SUPERVISOR_EVIDENCE_CANCELLED');
  const path=supervisorEvidencePath(ref?.path);if(seen.has(path))throw Error('SUPERVISOR_EVIDENCE_DUPLICATE_PATH');seen.add(path);
  if(typeof ref.sha256!=='string'||!/^[a-f0-9]{64}$/.test(ref.sha256))throw Error('SUPERVISOR_EVIDENCE_HASH_INVALID');
  const target=resolve(workspace,...path.split('/'));if(!inside(workspace,target))throw Error('SUPERVISOR_EVIDENCE_OUTSIDE_ROOT');
  let cursor=workspace;
  for(const part of path.split('/')){cursor=resolve(cursor,part);const info=await lstat(cursor);if(info.isSymbolicLink())throw Error('SUPERVISOR_EVIDENCE_LINK_NOT_ALLOWED');if(cursor!==target&&!info.isDirectory())throw Error('SUPERVISOR_EVIDENCE_PATH_NOT_DIRECTORY');}
  if(await realpath(target)!==target)throw Error('SUPERVISOR_EVIDENCE_LINK_NOT_ALLOWED');
  const handle=await open(target,fsConstants.O_RDONLY|(fsConstants.O_NOFOLLOW??0));
  try{
   const before=await handle.stat();if(!before.isFile()||before.size<1||before.size>SUPERVISOR_EVIDENCE_MAX_ITEM_BYTES||total+before.size>SUPERVISOR_EVIDENCE_MAX_TOTAL_BYTES)throw Error('SUPERVISOR_EVIDENCE_SIZE_INVALID');
   const chunks:Buffer[]=[];let size=0;for await(const chunk of handle.createReadStream({autoClose:false,signal})){size+=chunk.length;if(size>SUPERVISOR_EVIDENCE_MAX_ITEM_BYTES||total+size>SUPERVISOR_EVIDENCE_MAX_TOTAL_BYTES)throw Error('SUPERVISOR_EVIDENCE_SIZE_INVALID');chunks.push(Buffer.from(chunk));}
   const after=await handle.stat(),current=await lstat(target);if(size!==before.size||before.dev!==after.dev||before.ino!==after.ino||before.size!==after.size||before.mtimeMs!==after.mtimeMs||before.ctimeMs!==after.ctimeMs||current.isSymbolicLink()||current.dev!==after.dev||current.ino!==after.ino||await realpath(target)!==target)throw Error('SUPERVISOR_EVIDENCE_CHANGED');
   const content=Buffer.concat(chunks),text=content.toString('utf8'),sha256=createHash('sha256').update(content).digest('hex');if(Buffer.from(text,'utf8').compare(content)!==0||privateContent.test(text))throw Error('SUPERVISOR_EVIDENCE_PRIVATE_CONTENT');if(sha256!==ref.sha256)throw Error('SUPERVISOR_EVIDENCE_HASH_MISMATCH');
   receipts.push({path,sha256,size,contentBase64:content.toString('base64')});total+=size;
  }finally{await handle.close()}
 }
 return validateSupervisorEvidenceReceipts(receipts);
}
