/** Append explicit, public construction records. Never ingest credentials or conversations. */
import {readFile,open,mkdir,lstat,unlink,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,relative,dirname,sep} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';

const workspace=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const ledgerPath='docs/建设记录/events.jsonl';
const ZERO='0'.repeat(64);
const kinds=new Set(['decision','change','validation','release','incident','retrospective']);
const fields=new Set(['id','kind','project','retrospective','occurredAt','title','objective','changes','decisions','facts','verification','pending','lessons','evidence','state']);
const lists=['changes','decisions','facts','verification','pending','lessons'];
const canonical=value=>Array.isArray(value)?'['+value.map(canonical).join(',')+']':value&&typeof value==='object'?'{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key])).join(',')+'}':JSON.stringify(value);
const sha=value=>createHash('sha256').update(value).digest('hex');
const reject=code=>{throw Error(code);};
const text=(value,max=4000)=>{if(typeof value!=='string'||!value.trim()||value.length>max)reject('INVALID_RECORD_TEXT');return value;};
function secretGuard(value){
 const credentialKey=key=>/^(?:(?:[a-z0-9]+)[_-])*(?:api[_-]?key|password|secret|token|cookie)$/i.test(key);
 const privateValue=(key,raw)=>typeof raw==='string'&&raw.trim()&&!/^(?:\*+|\[redacted\]|<redacted>|redacted|masked|not[_ -]?set)$/i.test(raw.trim())&&(/password$/i.test(key)||raw.trim().length>=12);
 function scan(item){
  if(typeof item==='string'){
   if(/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\bsk-(?:proj-)?[A-Za-z0-9_-]{16,}|\bBearer\s+[A-Za-z0-9_.+/=-]{12,}|\bjarvis_session\s*=\s*[A-Za-z0-9_-]{12,}|https?:\/\/[^\s/]+:[^\s/]+@/i.test(item))reject('PRIVATE_VALUE_NOT_ALLOWED');
   for(const match of item.matchAll(/(?:^|[\s{,;])(["']?)([A-Za-z][A-Za-z0-9_-]*)\1\s*[:=]\s*(?:"([^"\r\n]*)"|'([^'\r\n]*)'|([^\s,;{}"']+))/g))if(credentialKey(match[2])&&privateValue(match[2],match[3]??match[4]??match[5]))reject('PRIVATE_VALUE_NOT_ALLOWED');
  }else if(Array.isArray(item)){for(const entry of item)scan(entry);}
  else if(item&&typeof item==='object'){for(const [key,entry] of Object.entries(item)){if(credentialKey(key)&&privateValue(key,entry))reject('PRIVATE_VALUE_NOT_ALLOWED');scan(entry);}}
 }
 scan(value);
}
function recordShape(input){
 if(!input||Array.isArray(input)||typeof input!=='object'||Object.keys(input).some(key=>!fields.has(key)))reject('INVALID_RECORD_FIELDS');
 if(!/^[A-Z][A-Z0-9-]{5,99}$/.test(input.id??'')||!kinds.has(input.kind)||!['jarvis','software-factory'].includes(input.project))reject('INVALID_RECORD_IDENTITY');
 const occurredAt=input.occurredAt??null;
 if(occurredAt!==null&&(!/^\d{4}-\d{2}-\d{2}(?:T.*Z)?$/.test(occurredAt)||!Number.isFinite(Date.parse(occurredAt))||new Date(occurredAt).toISOString().slice(0,10)!==occurredAt.slice(0,10)))reject('INVALID_RECORD_DATE');
 if(input.retrospective!==undefined&&typeof input.retrospective!=='boolean')reject('INVALID_RETROSPECTIVE');
 const record={id:input.id,kind:input.kind,project:input.project,retrospective:input.retrospective??false,occurredAt,title:text(input.title,300),objective:text(input.objective)};
 for(const key of lists){const values=input[key]??[];if(!Array.isArray(values)||values.length>100)reject('INVALID_RECORD_LIST');record[key]=values.map(value=>text(value));}
 if(input.state!==undefined){
  const allowed={implementation:['complete','partial','not-started','not-applicable'],verification:['passed','partial','failed','not-run','not-applicable'],deployment:['live','staged','not-deployed','not-applicable'],acceptance:['accepted','pending','not-applicable']};
  if(!input.state||Array.isArray(input.state)||typeof input.state!=='object'||Object.keys(input.state).length!==4||Object.entries(input.state).some(([key,value])=>!allowed[key]?.includes(value)))reject('INVALID_RECORD_STATE');
  record.state=input.state;
 }
 const evidence=input.evidence??[];if(!Array.isArray(evidence)||evidence.length>50||new Set(evidence).size!==evidence.length)reject('INVALID_RECORD_EVIDENCE');
 record.evidence=evidence.map(value=>text(value,1000));
 if((record.kind==='validation'||record.kind==='release'||record.state?.verification==='passed'||record.state?.deployment==='live')&&(!record.evidence.length||!record.verification.length))reject('VERIFICATION_EVIDENCE_REQUIRED');
 secretGuard(record);return record;
}
async function evidenceFile(root,name){
 if(name.includes('\\')||name.startsWith('/')||name.includes(':')||name.split('/').some(part=>!part||part==='.'||part==='..'||/^(?:\.git|\.secrets|\.jarvis.*|serverinfo|node_modules|server-access|credentials|pi-sessions|conversations)$/i.test(part))||!(name.startsWith('docs/')||name.startsWith('artifacts/')||name.startsWith('scripts/')||name.startsWith('apps/')||['README.md','AGENTS.md','CLAUDE.md'].includes(name)||/^贾维斯[^/]*\.(?:md|html)$/.test(name))||/(?:^|\/)(?:\.env(?:\..*)?|.*\.(?:pem|key|sqlite|db|jsonl)|.*(?:api-key|private-key|password|secret).*)$/i.test(name))reject('PRIVATE_OR_INVALID_EVIDENCE_PATH');
 const target=resolve(root,name),rel=relative(root,target);if(rel.startsWith('..')||rel.includes(':'+sep))reject('EVIDENCE_OUTSIDE_WORKSPACE');
 let current=root;
 for(const part of name.split('/')){current=resolve(current,part);const stat=await lstat(current);if(stat.isSymbolicLink())reject('SYMLINK_EVIDENCE_NOT_ALLOWED');}
 const stat=await lstat(target);if(!stat.isFile()||stat.size>8*1024*1024)reject('EVIDENCE_FILE_INVALID');
 const bytes=await readFile(target);secretGuard(bytes.toString('utf8'));return {path:name,sha256:sha(bytes),bytes:bytes.length};
}
export async function readConstructionRecords(root=workspace){
 let raw;try{raw=await readFile(resolve(root,ledgerPath),'utf8');}catch(error){if(error.code==='ENOENT')return [];throw error;}
 if(Buffer.byteLength(raw)>32*1024*1024||raw&&!raw.endsWith('\n'))reject('CONSTRUCTION_LEDGER_INCOMPLETE');
 const records=[],ids=new Set();let previousHash=ZERO;
 for(const line of raw.split('\n').filter(Boolean)){
  const record=JSON.parse(line),{hash,...body}=record;
  if(body.formatVersion!==1||body.previousHash!==previousHash||!/^\d{4}-\d{2}-\d{2}T.*Z$/.test(body.recordedAt??'')||!Number.isFinite(Date.parse(body.recordedAt))||hash!==sha(canonical(body))||ids.has(body.id)||!Array.isArray(body.evidence)||body.evidence.some(e=>!e||!/^([a-f0-9]{64})$/.test(e.sha256)||typeof e.path!=='string'||!Number.isSafeInteger(e.bytes)||e.bytes<0))reject('CONSTRUCTION_LEDGER_INTEGRITY_FAILED');
  const input=Object.fromEntries(Object.entries(body).filter(([key])=>fields.has(key)));input.evidence=body.evidence.map(e=>e.path);recordShape(input);
  if(Object.keys(body).some(key=>!fields.has(key)&&!['formatVersion','recordedAt','previousHash'].includes(key)))reject('INVALID_STORED_RECORD_FIELDS');
  ids.add(body.id);records.push(record);previousHash=hash;
 }
 return records;
}
export async function appendConstructionRecords(inputs,{root=workspace,execute=false,now=new Date().toISOString()}={}){
 const values=Array.isArray(inputs)?inputs:[inputs];if(!values.length||values.length>50)reject('RECORD_BATCH_LIMIT');
 const normalized=values.map(recordShape);if(new Set(normalized.map(r=>r.id)).size!==values.length)reject('DUPLICATE_BATCH_ID');
 if(!Number.isFinite(Date.parse(now))||!/^\d{4}-\d{2}-\d{2}T.*Z$/.test(now))reject('INVALID_RECORD_TIMESTAMP');
 const prepared=[];for(const value of normalized)prepared.push({...value,evidence:await Promise.all(value.evidence.map(name=>evidenceFile(root,name)))});
 const location=resolve(root,ledgerPath),lockPath=location+'.lock';let lock;
 if(execute){await mkdir(dirname(location),{recursive:true});lock=await open(lockPath,'wx',0o600);}
 try{
  if(lock){await lock.writeFile(JSON.stringify({pid:process.pid,at:now})+'\n');await lock.sync();}
  const existing=await readConstructionRecords(root),added=[],reused=[];
  let previousHash=existing.at(-1)?.hash??ZERO;
  for(const value of prepared){
   const old=existing.find(r=>r.id===value.id);
   if(old){const {hash,previousHash:previous,recordedAt,formatVersion,...original}=old;if(canonical(original)!==canonical(value))reject('EXISTING_RECORD_CANNOT_BE_REWRITTEN');reused.push(value.id);continue;}
   const body={...value,formatVersion:1,recordedAt:now,previousHash};const record={...body,hash:sha(canonical(body))};added.push(record);previousHash=record.hash;
  }
  const serialized=added.map(record=>JSON.stringify(record)+'\n').join('');
  if(Buffer.byteLength(existing.map(record=>JSON.stringify(record)+'\n').join(''))+Buffer.byteLength(serialized)>32*1024*1024)reject('CONSTRUCTION_LEDGER_SIZE_LIMIT');
  if(execute&&added.length){const handle=await open(location,'a',0o600);try{await handle.writeFile(serialized);await handle.sync();}finally{await handle.close();}}
  return {executed:execute,added:added.map(r=>r.id),reused,records:existing.length+added.length,headHash:previousHash,path:ledgerPath};
 }finally{if(lock){await lock.close();await unlink(lockPath);}}
}
const display=value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replace(/([\\`*_{}\[\]()#+.!|~\-])/g,'\\$1');
export async function renderConstructionRecords(root=workspace){
 const records=await readConstructionRecords(root),latest=records.at(-1),date=latest?.recordedAt.slice(0,10)??new Date().toISOString().slice(0,10);
 const labels={changes:'本次改变',decisions:'决策与原因',facts:'事实与边界',verification:'验证结果',pending:'待办与未确认事项',lessons:'经验候选'};
 const sections=records.map(record=>{
  const sections=[`## ${display(record.id)} · ${display(record.title)}`,`发生时间：${record.occurredAt??'历史日期未核实'}；记录时间：${record.recordedAt}；项目：${record.project==='jarvis'?'贾维斯':'软件工厂'}；类型：${record.kind}${record.retrospective?'（历史回顾）':''}。`,`目标：${display(record.objective)}`];
  if(record.state){const names={implementation:'实现',verification:'验证',deployment:'上线',acceptance:'验收'},values={complete:'已完成',partial:'部分完成','not-started':'未开始','not-applicable':'不适用',passed:'已通过',failed:'未通过','not-run':'未运行',live:'已上线',staged:'已预置','not-deployed':'未上线',accepted:'已验收',pending:'待验收'};sections.push('状态：'+Object.entries(record.state).map(([k,v])=>`${names[k]}：${values[v]}`).join(' · '));}
  for(const [key,label] of Object.entries(labels))if(record[key].length)sections.push(`### ${label}\n\n`+record[key].map(value=>'- '+display(value)).join('\n'));
  if(record.evidence.length)sections.push('### 证据与当时指纹\n\n'+record.evidence.map(e=>`- [${display(e.path)}](${encodeURI('../'+e.path)}) · SHA-256：${e.sha256}`).join('\n'));
  sections.push(`记录指纹：${record.hash}；前一条：${record.previousHash}。`);return sections.join('\n\n');
 });
 const markdown=['# 贾维斯建设日志',`<!-- jarvis-doc-meta ${JSON.stringify({version:'建设记录 1.0',date,eyebrow:'建设过程 / 验证证据 / 经验沉淀',subtitle:'保留每一阶段的改变、原因、验证、遗留问题与经验；历史回顾和当时记录分别标明。',stats:[{value:String(records.length)+' 条',label:'已归档记录'},{value:'追加保存',label:'旧记录保留原文'},{value:'事实分层',label:'实现 · 验证 · 上线 · 验收'}]})} -->`,'本页由 [建设记录原始账本](建设记录/events.jsonl) 生成。详细维护方式见 [建设档案](贾维斯建设档案.md)。历史回顾以现有文档为依据，不补写缺失的决定动机或现场验收。日期时间为 ISO 格式，Z 表示 UTC；中国时间加八小时。证据指纹记录当时文件内容，后续文件可能另有更新。','历史记录保持原文；更正以新记录说明，不能覆盖先前结果。'+(latest?' 当前末条指纹：'+latest.hash+'。':''),...sections].join('\n\n')+'\n';
 const output=resolve(root,'docs/贾维斯建设日志.md');await mkdir(dirname(output),{recursive:true});await writeFile(output,markdown,'utf8');return {markdown:'docs/贾维斯建设日志.md',records:records.length,headHash:latest?.hash??ZERO};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{
  const inputIndex=process.argv.indexOf('--input');let result;
  if(inputIndex>=0){const input=await readFile(resolve(process.argv[inputIndex+1]),'utf8');if(Buffer.byteLength(input)>1024*1024)reject('RECORD_INPUT_TOO_LARGE');result=await appendConstructionRecords(JSON.parse(input),{execute:process.argv.includes('--execute')});}
  else{const records=await readConstructionRecords();result={verified:true,records:records.length,headHash:records.at(-1)?.hash??ZERO};}
  if(process.argv.includes('--render')){if(inputIndex>=0&&!process.argv.includes('--execute'))reject('DRY_RUN_CANNOT_RENDER');result.render=await renderConstructionRecords();const html=spawnSync(process.execPath,['scripts/build-design-html.mjs','docs/贾维斯建设日志.md'],{cwd:workspace,encoding:'utf8',windowsHide:true,timeout:30000});if(html.status!==0)reject('CONSTRUCTION_HTML_BUILD_FAILED');result.render.html='docs/贾维斯建设日志.html';}
  console.log(JSON.stringify(result));
 }catch(error){console.error(JSON.stringify({ok:false,code:/^[A-Z0-9_]+$/.test(error.message)?error.message:error.code==='EEXIST'?'CONSTRUCTION_RECORD_LOCKED':'CONSTRUCTION_RECORD_FAILED'}));process.exitCode=1;}
}
