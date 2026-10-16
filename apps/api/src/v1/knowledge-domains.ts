import { createHash, randomUUID } from 'node:crypto';
import { BusinessError, type BusinessRecord, type CommandContext, type Domain, type DomainHandler } from './types.js';

type Values = Record<string, any>;
const fail = (message:string,code='VALIDATION',status=400):never => { throw new BusinessError(code,message,status); };
const ensure = (ok:unknown,message:string,code='REVIEW_REQUIRED',status=422):void => { if(!ok) fail(message,code,status); };
const string = (v:unknown,label:string,max=20000,preserve=false):string => { ensure(typeof v==='string'&&!!v.trim()&&v.length<=max,`${label}不能为空或过长`,'VALIDATION',400);return preserve?v as string:(v as string).trim(); };
const optional = (v:unknown,max=4000):string => v===undefined||v===null||v===''?'':string(v,'填写内容',max);
const choice = (v:unknown,list:string[],label:string):string => { ensure(typeof v==='string'&&list.includes(v),`${label}无效`,'VALIDATION',400);return v as string; };
const integer = (v:unknown,min:number,max:number,label:string):number => { ensure(typeof v==='number'&&Number.isInteger(v)&&v>=min&&v<=max,`${label}无效`,'VALIDATION',400);return v as number; };
const strings = (v:unknown,label:string,min=0,max=100):string[] => { ensure(Array.isArray(v)&&v.length>=min&&v.length<=max,`${label}无效`,'VALIDATION',400);return [...new Set((v as unknown[]).map(s=>string(s,label,4000)))]; };
const digest=(v:string)=>createHash('sha256').update(v).digest('hex');
const newly=(ctx:CommandContext)=>ensure(ctx.expectedVersion===0,'新增记录的版本必须为0','CONFLICT',409);
function primary(ctx:CommandContext,domain:Domain,id:unknown,kind?:string):BusinessRecord { const record=ctx.require(domain,string(id,'对象 ID',200),true);ctx.check(record);if(kind)ensure(record.kind===kind,'记录类型不匹配','VALIDATION',400);return record; }
function source(ctx:CommandContext,id:unknown):BusinessRecord { const record=ctx.require('sources',string(id,'知识来源',200));ensure(record.kind==='source'&&record.active&&record.authorized,'来源未启用或授权已撤销');return record; }
function book(ctx:CommandContext,id:unknown):BusinessRecord { const r=ctx.require('books',string(id,'书籍 ID',200));ensure(r.kind==='book','书目不存在','VALIDATION',404);source(ctx,r.source);return r; }
function published(ctx:CommandContext,id:unknown):BusinessRecord {const r=book(ctx,id);ensure(r.status==='published'&&r.stage===6&&r.published,'原文尚未发布');return r;}
function editable(ctx:CommandContext,r:BusinessRecord):void {source(ctx,r.source);ensure(r.status!=='published','已发布原文只能创建修订草稿');}
function pageNumber(r:BusinessRecord,value:unknown):number {return integer(value,1,r.pages,'页码');}
function log(r:BusinessRecord,ctx:CommandContext,text:string):Values[] {return [...(r.audit??[]),{time:ctx.now,text,actorId:ctx.actorId}];}
function fullText(pages:Values[]):string {return [...pages].sort((a,b)=>a.page-b.page).map(p=>p.text).join('\n\n');}
function learner(ctx:CommandContext,profile:unknown):string {const id=profile===undefined?'me':string(profile,'学习者',200);if(id==='me'||id===ctx.actorId||id==='owner')return 'me';ensure(ctx.scope==='family','其他家庭成员的课程只能引用家庭共享内容','FORBIDDEN',403);const member=(ctx as CommandContext&{member?:(id:string)=>Values|undefined}).member?.(id);ensure(member&&member.status!=='archived','请先登记真实家庭成员；记录由管理员维护，不代表成员身份认证','FORBIDDEN',403);return id;}
function readyStory(ctx:CommandContext,id:unknown):BusinessRecord {const s=ctx.require('stories',string(id,'故事 ID',200));const b=published(ctx,s.book);ensure(s.kind==='story'&&s.released&&!s.dirty&&s.version===b.version,'故事未复核或原文版本已改变');return s;}
function invalidate(ctx:CommandContext,b:BusinessRecord):void {for(const s of ctx.list('stories').filter(s=>s.book===b.id&&s.kind==='story'))ctx.update('stories',s.id,{dirty:true,released:false,updatedAt:ctx.now});for(const c of ctx.list('learning').filter(c=>c.kind==='course'&&c.stories.some((id:string)=>ctx.get('stories',id)?.book===b.id)))ctx.update('learning',c.id,{status:'stale',updatedAt:ctx.now});}
function indexSource(ctx:CommandContext,sourceId:string):void {const src=ctx.require('sources',sourceId,true),indexedBooks=ctx.list('books').filter(b=>b.kind==='book'&&b.source===sourceId&&b.status==='published').map(b=>({bookId:b.id,title:b.title,version:b.version,pages:b.pages}));ctx.update('sources',src.id,{count:indexedBooks.length,indexedBooks,lastIndexAt:ctx.now,updatedAt:ctx.now});ctx.emit('sources',src.id,'local-index-updated',{count:indexedBooks.length});}
function nonTextRecorded(entry:Values,scanHash:string):boolean {return entry.nonTextPage===true&&entry.text===''&&['blank','illustration'].includes(entry.nonTextKind)&&entry.nonTextEvidence?.textHash===digest('')&&entry.nonTextEvidence.scanHash===scanHash&&!!entry.nonTextEvidence.actorId&&!!entry.nonTextEvidence.evidence;}
function manualPage(p:Values,ctx:CommandContext,scanHash:string):Values {if(p.nonTextPage===true){ensure(p.nonTextConfirmed===true&&p.text===''&&p.textHash===digest('')&&p.scanHash===scanHash,'空白／插图页须人工明确确认、保留空原文，并绑定当前原件和空正文指纹');const kind=choice(p.nonTextKind,['blank','illustration'],'非文字页类型'),evidence=string(p.evidence??p.reason,'非文字页回查依据',4000);return {text:'',nonTextPage:true,nonTextKind:kind,pageDescription:optional(p.pageDescription,4000),nonTextEvidence:{actorId:ctx.actorId,at:ctx.now,evidence,textHash:digest(''),scanHash}};}return {text:string(p.text,'忠实原文',60000,true),nonTextPage:false,nonTextKind:null,pageDescription:'',nonTextEvidence:null};}
function reviewGates(r:BusinessRecord):void {ensure(r.file?.sha256&&r.file?.stored,'真实原件尚未入库');ensure(r.pagesVerified===true,'请确认原件页数和页序');ensure(r.pageTexts.length===r.pages&&Array.from({length:r.pages},(_,i)=>i+1).every(page=>r.pageTexts.some((p:Values)=>p.page===page&&(p.text.trim()||nonTextRecorded(p,r.file.sha256)))),'请登记全部页面原文；空白／插图页也必须保留页码并人工分类');ensure(r.doubts.every((d:Values)=>d.status==='resolved'),'仍有未裁决疑点');ensure(r.pageTexts.every((p:Values)=>p.review&&p.review.textHash===digest(p.text)&&p.review.scanHash===r.file.sha256&&(!p.nonTextPage||p.review.nonTextConfirmed===true)),'请逐页复核当前原件和正文；非文字页仍需独立人工确认');}

const sources:DomainHandler={domain:'sources',commands:['save','toggle','authorize','query','sync','configure','disable'],execute(command,p,ctx){
 if(command==='query'){
  const query=string(p.query,'检索问题',1000),mode=choice(p.mode??'all',['all','local','live'],'检索模式');newly(ctx);
  if(mode==='live')fail('外部连接器尚未配置，未发起实时检索','NOT_CONFIGURED',503);
  const terms=query.toLocaleLowerCase().split(/[\s、，,]+/).filter(Boolean),allowed=ctx.list('sources').filter(s=>s.kind==='source'&&s.active&&s.authorized&&s.mode!=='live');
  const results:Values[]=[];for(const b of ctx.list('books').filter(b=>b.kind==='book'&&b.status==='published'&&allowed.some(s=>s.id===b.source)))for(const page of b.pageTexts??[])if(terms.some(t=>`${b.title} ${page.text}`.toLocaleLowerCase().includes(t)))results.push({title:`${b.title} · 第 ${page.page} 页`,text:page.text.slice(0,4000),source:b.source,book:b.id,page:page.page,version:b.version});
  const result=ctx.create('sources',{kind:'query',status:'complete',query,text:query,mode,results:results.slice(0,100),partial:mode==='all'&&ctx.list('sources').some(s=>s.kind==='source'&&s.mode!=='local'),notice:'仅检索已授权且已发布的本地原文；外部来源尚未执行查询。',createdAt:ctx.now,updatedAt:ctx.now});ctx.emit('sources',result.id,'queried',{count:result.results.length,partial:result.partial});return result;
 }
 if(command==='save'){
  const old=p.sourceId?primary(ctx,'sources',p.sourceId,'source'):null;if(!old)newly(ctx);
  const mode=choice(p.mode,['local','live','hybrid'],'检索模式'),authorized=p.authorized;
  ensure(typeof authorized==='boolean','请明确授权状态','VALIDATION',400);
  const endpoint=string(p.endpoint,'来源地址',2000);ensure(!/\0|[\r\n]/.test(endpoint),'来源地址格式无效','VALIDATION',400);
  if(mode!=='local'){let parsed:URL;try{parsed=new URL(endpoint)}catch{fail('外部来源请填写 HTTPS 地址')};ensure(['https:','http:'].includes(parsed!.protocol)&&!parsed!.username&&!parsed!.password,'来源地址不能包含凭据或非HTTP协议','VALIDATION',400);}
  const body={kind:'source',name:string(p.name,'来源名称',300),type:string(p.type,'连接类型',100),mode,endpoint,topics:string(p.topics,'主题标签',2000),rights:string(p.rights,'来源与使用范围',4000),authorized,active:old?.active??true,health:authorized?'本地可登记 / 连接器待配置':'授权已撤销',sync:'尚未同步',count:old?.count??0,version:String((old?.revision??0)+1),status:authorized?'configured':'revoked',records:[],authorizationHistory:[...(old?.authorizationHistory??[]),{authorized,rights:p.rights,actorId:ctx.actorId,at:ctx.now}],connectorStatus:'not-configured',updatedAt:ctx.now};
  const r=old?ctx.update('sources',old.id,body):ctx.create('sources',{...body,createdAt:ctx.now});ctx.emit('sources',r.id,'configured',{authorized});return r;
 }
 const r=primary(ctx,'sources',p.sourceId,'source');
 if(command==='sync')fail('该来源连接器尚未配置，未同步或伪造资料','NOT_CONFIGURED',503);
 if(command==='toggle'){ensure(typeof p.active==='boolean','启用状态无效','VALIDATION',400);ensure(!p.active||r.authorized,'请先确认来源授权');const result=ctx.update('sources',r.id,{active:p.active,updatedAt:ctx.now});ctx.emit('sources',r.id,'toggled',{active:p.active});return result;}
 if(command==='authorize'){ensure(typeof p.authorized==='boolean','授权状态无效','VALIDATION',400);const reason=string(p.reason,'授权变更依据',4000),result=ctx.update('sources',r.id,{authorized:p.authorized,rights:reason,status:p.authorized?'configured':'revoked',authorizationHistory:[...r.authorizationHistory,{authorized:p.authorized,reason,actorId:ctx.actorId,at:ctx.now}],updatedAt:ctx.now});ctx.emit('sources',r.id,'authorized',{authorized:p.authorized});return result;}
 return fail('知识源命令不存在');
}};

const books:DomainHandler={domain:'books',commands:['create-upload','create','material-source','page','doubt','verdict','review-page','review-all','publish','revision','recheck','advance','rescan','upload-ticket','register','parse','page-review'],execute(command,p,ctx){
 if(command==='material-source'){
  const material=primary(ctx,'books',p.materialId,'material');ensure(material.status==='pending','资料候选已经处理');
  const candidate=ctx.create('sources',{kind:'source',status:'candidate',name:`${material.title} · 来源候选`,type:'本地文档库',mode:'local',endpoint:`inbox://${material.sourceInboxId??material.id}`,topics:'待整理资料',rights:'来自原始收件；授权与使用范围尚待确认',active:false,authorized:false,health:'待授权',sync:'尚未同步',count:0,version:'draft-1',records:[],authorizationHistory:[],connectorStatus:'not-configured',originMaterialId:material.id,sourceInboxId:material.sourceInboxId??null,createdAt:ctx.now,updatedAt:ctx.now});
  const result=ctx.update('books',material.id,{status:'source',target:candidate.id,updatedAt:ctx.now});ctx.emit('sources',candidate.id,'candidate-created',{materialId:material.id});ctx.emit('books',material.id,'material-routed',{targetId:candidate.id});return result;
 }
 if(command==='create-upload'){
  newly(ctx);const src=source(ctx,p.sourceId),filename=string(p.filename,'文件名',300),mime=choice(p.mime,['application/pdf','image/png','image/jpeg','image/webp'],'扫描文件类型'),size=integer(p.size,1,32*1024*1024,'文件大小');
  ensure(!/[\x00-\x1f]/.test(filename),'文件名包含控制字符','VALIDATION',400);const r=ctx.create('books',{kind:'upload',status:'awaiting-file',source:src.id,filename,mime,size,stored:false,expiresAt:new Date(Date.parse(ctx.now)+30*60*1000).toISOString(),createdAt:ctx.now,updatedAt:ctx.now});ctx.emit('books',r.id,'upload-created',{size,mime});return r;
 }
 // Only the authenticated binary upload route calls this command; it is not in the public command list.
 if(command==='complete-upload'){
  const r=primary(ctx,'books',p.uploadId,'upload');source(ctx,r.source);ensure(r.status==='awaiting-file'&&Date.parse(r.expiresAt)>Date.parse(ctx.now),'上传票据已使用或过期');ensure(p.size===r.size&&p.mime===r.mime&&typeof p.sha256==='string'&&/^[a-f0-9]{64}$/.test(p.sha256),'文件校验失败','VALIDATION',400);
  const result=ctx.update('books',r.id,{status:'stored',stored:true,sha256:p.sha256,updatedAt:ctx.now});ctx.emit('books',r.id,'file-stored',{size:r.size,sha256:p.sha256});return result;
 }
 if(command==='create'){
  newly(ctx);const upload=ctx.require('books',string(p.uploadId,'上传票据',200),true);ensure(upload.kind==='upload'&&upload.status==='stored'&&upload.stored&&!upload.bookId&&(!upload.copyState||upload.copyState==='complete'),'请先上传真实文件或完成已存原件复用，再使用尚未归档的上传票据');const src=source(ctx,upload.source);ensure(src.mode!=='live','实时查询来源不能直接保存本地扫描书籍');
  const material=p.materialId?ctx.require('books',string(p.materialId,'资料候选',200),true):null;if(material)ensure(material.kind==='material'&&material.status==='pending','资料候选已经处理');
  const declaredPages=integer(p.pages,1,10000,'页数');ensure(upload.mime==='application/pdf'||declaredPages===1,'单张扫描图片只能登记一页；多页请合成PDF');
  const r=ctx.create('books',{kind:'book',title:string(p.title,'书目名称',300),cover:String(p.title).slice(0,4),edition:string(p.edition,'版本与注本',500),author:optional(p.author)||'未填写',source:src.id,rights:string(p.rights,'原件使用范围',4000),filename:upload.filename,file:{uploadId:upload.id,sha256:upload.sha256,stored:true,mime:upload.mime,size:upload.size},materialId:material?.id??null,sourceInboxId:material?.sourceInboxId??null,pages:declaredPages,pagesVerified:false,bytes:`${(upload.size/1024/1024).toFixed(2)} MB`,stage:0,status:'registered',version:'1.0',rounds:0,reviewed:[],pageTexts:[],doubts:[],text:'',normalized:'',scanHash:upload.sha256,created:ctx.now,published:null,revisions:[],layout:optional(p.layout)||'待人工核对',audit:[{time:ctx.now,text:'真实文件已入库；原文尚未解析或登记，发布需逐页人工复核。',actorId:ctx.actorId}],createdAt:ctx.now,updatedAt:ctx.now});ctx.update('books',upload.id,{bookId:r.id,updatedAt:ctx.now});if(material){ctx.update('books',material.id,{status:'book',target:r.id,updatedAt:ctx.now});ctx.emit('books',material.id,'material-routed',{targetId:r.id});}ctx.emit('books',r.id,'registered',{uploadId:upload.id,pages:r.pages});return r;
 }
 const r=primary(ctx,'books',p.bookId,'book');source(ctx,r.source);
 if(command==='advance')fail('自动版面分析与OCR尚未配置。请登记逐页原文并人工复核，未生成识别结果','NOT_CONFIGURED',503);
 if(command==='publish'){
  editable(ctx,r);reviewGates(r);ensure(p.confirmed===true,'请明确确认发布人工复核版本');const result=ctx.update('books',r.id,{stage:6,status:'published',published:ctx.now,text:fullText(r.pageTexts),normalized:r.pageTexts.map((p:Values)=>p.normalized||'').join('\n\n'),audit:log(r,ctx,`人工发布原文 v${r.version}；逐页记录与已知疑点均已复核，不作自动零错误保证。`),updatedAt:ctx.now});indexSource(ctx,result.source);ctx.emit('books',r.id,'published',{version:r.version,pages:r.pages});return result;
 }
 if(command==='revision'){
  ensure(r.status==='published','只有已发布原文可以创建修订');ensure(p.checked===true,'请确认按真实原件复核修订');const page=pageNumber(r,p.page),transcription=manualPage(p,ctx,r.file.sha256),text=transcription.text,reason=string(p.reason,'修订原因与证据',4000);
  const versions=[...(r.revisions??[]),{version:r.version,date:ctx.now,text:r.text,pageTexts:structuredClone(r.pageTexts),doubts:structuredClone(r.doubts),reviewed:[...r.reviewed],reason,published:r.published}],next=`${Number(r.version.split('.')[0])}.${Number(r.version.split('.')[1])+1}`;
  const pages=r.pageTexts.map((entry:Values)=>entry.page===page?{...entry,...transcription,text,transcriptionOrigin:'human',textHash:digest(text),review:null,history:[...(entry.history??[]),{text:entry.text,at:ctx.now,reason,actorId:ctx.actorId}]}:entry);
  const result=ctx.update('books',r.id,{version:next,revisions:versions,pageTexts:pages,text:fullText(pages),status:'review',stage:5,published:null,reviewed:pages.filter((entry:Values)=>entry.review?.textHash===digest(entry.text)).map((entry:Values)=>entry.page),audit:log(r,ctx,`修订草稿 v${next}，第${page}页：${reason}；重新复核后才能发布。`),updatedAt:ctx.now});invalidate(ctx,result);indexSource(ctx,result.source);ctx.emit('books',r.id,'revision-created',{version:next,page});return result;
 }
 editable(ctx,r);
 if(command==='page'){
  const page=pageNumber(r,p.page),transcription=manualPage(p,ctx,r.file.sha256),text=transcription.text,evidence=string(p.evidence,'原件定位和转录依据',4000);ensure(p.pagesVerified===true,'请确认原件页数和页序');const old=r.pageTexts.find((entry:Values)=>entry.page===page),entry={page,...transcription,text,transcriptionOrigin:'human',normalized:transcription.nonTextPage?'':optional(p.normalized,20000),evidence,review:null,ocrPasses:old?.ocrPasses??[],scanHash:old?.scanHash??r.file.sha256,textHash:digest(text),history:[...(old?.history??[]),...(old?[{text:old.text,at:ctx.now,actorId:ctx.actorId}]:[])],updatedAt:ctx.now};const pages=[...r.pageTexts.filter((entry:Values)=>entry.page!==page),entry].sort((a,b)=>a.page-b.page);
  const doubts=r.doubts.map((d:Values)=>d.page===page&&d.origin==='machine-ocr'&&d.status!=='resolved'?{...d,status:'resolved',decision:'人工整页重新转录',note:evidence,reviewedBy:ctx.actorId,reviewedAt:ctx.now,replacementTextHash:digest(text)}:d);
  const result=ctx.update('books',r.id,{pageTexts:pages,doubts,text:fullText(pages),reviewed:r.reviewed.filter((n:number)=>n!==page),pagesVerified:true,status:'review',stage:5,audit:log(r,ctx,`人工登记第${page}页忠实原文；机器疑点保留整页重录依据，仍需要独立逐页复核。`),updatedAt:ctx.now});ctx.emit('books',r.id,'page-recorded',{page});return result;
 }
 if(command==='doubt'){
  const page=pageNumber(r,p.page),q={id:randomUUID(),page,version:r.version,type:string(p.type,'疑点类型',100),critical:p.critical!==false,status:'pending',ocr:string(p.ocr,'待核原文',20000,true),alternate:optional(p.alternate,20000),expected:'',focus:optional(p.focus)||'原文',before:'',after:'',reason:string(p.reason,'疑点依据',4000),confidence:null,decision:'',note:'',createdAt:ctx.now};
  const pages=r.pageTexts.map((entry:Values)=>entry.page===page?{...entry,review:null}:entry);const result=ctx.update('books',r.id,{doubts:[...r.doubts,q],pageTexts:pages,reviewed:r.reviewed.filter((n:number)=>n!==page),audit:log(r,ctx,`登记第${page}页人工疑点：${q.reason}`),updatedAt:ctx.now});ctx.emit('books',r.id,'doubt-created',{page,doubtId:q.id});return result;
 }
 if(command==='verdict'||command==='rescan'){
  const q=r.doubts.find((d:Values)=>d.id===p.doubtId);ensure(q,'疑点不存在','VALIDATION',404);ensure(q.status!=='resolved','已裁决疑点不能覆盖');let patch:Values={},pages=r.pageTexts;
  if(command==='rescan'){
   const ticket=ctx.require('books',string(p.uploadId,'补扫文件',200));ensure(ticket.kind==='upload'&&ticket.stored&&ticket.status==='stored'&&ticket.source===r.source&&(!ticket.copyState||ticket.copyState==='complete'),'请先上传同来源的真实补扫文件，或完成已存原件复用');ensure(ticket.sha256!==r.file.sha256,'补扫文件与原始文件完全相同，请补交新的清晰证据');patch={status:'pending',rescanEvidence:{uploadId:ticket.id,sha256:ticket.sha256,mime:ticket.mime,at:ctx.now},note:string(p.note,'补扫说明',4000)};
  }else if(p.decision==='rescan'){patch={status:'escalated',note:string(p.note,'补扫依据',4000),decision:''};}
  else{choice(p.decision,['confirm'],'裁决方式');ensure(!['escalated','rescan'].includes(q.status)||q.rescanEvidence,'升级疑点需要真实补扫文件');const text=string(p.text,'确认原文',20000,true),note=string(p.note,'人工裁决依据',4000),page=r.pageTexts.find((entry:Values)=>entry.page===q.page);ensure(page,'请先登记本页完整原文');ensure(page.text.includes(q.ocr),'待核原文已不在当前页，请重新登记疑点');ensure(page.text.split(q.ocr).length===2,'待核片段在本页重复，请缩小到唯一包含上下文的定位');pages=r.pageTexts.map((entry:Values)=>{if(entry.page!==q.page)return entry;const corrected=entry.text.replace(q.ocr,text);return {...entry,text:corrected,transcriptionOrigin:'human',textHash:digest(corrected),review:null};});patch={status:'resolved',corrected:text,decision:text,note,reviewedBy:ctx.actorId,reviewedAt:ctx.now};}
  const result=ctx.update('books',r.id,{doubts:r.doubts.map((d:Values)=>d.id===q.id?{...d,...patch}:d),pageTexts:pages,text:fullText(pages),reviewed:r.reviewed.filter((n:number)=>n!==q.page),audit:log(r,ctx,`第${q.page}页疑点${patch.status==='resolved'?'人工裁决':'继续等待证据'}。`),updatedAt:ctx.now});ctx.emit('books',r.id,command,{doubtId:q.id,status:patch.status});return result;
 }
 if(command==='review-page'){
  const page=pageNumber(r,p.page),entry=r.pageTexts.find((entry:Values)=>entry.page===page);ensure(entry&&(entry.text?.trim()||nonTextRecorded(entry,r.file.sha256)),'本页没有忠实原文或已确认的非文字页分类');if(entry?.nonTextPage)ensure(p.nonTextConfirmed===true&&p.textHash===digest(entry.text)&&p.scanHash===r.file.sha256,'请独立确认本页没有文字，并绑定空正文和原件指纹');ensure(!r.doubts.some((d:Values)=>d.page===page&&d.status!=='resolved'),'本页仍有未裁决疑点');ensure(p.confirmed===true,'请确认已经逐字回查真实原件');ensure(!r.ocr||p.pagesVerified===true||r.pagesVerified===true,'机器识别后请明确确认实际页数和页序');const evidence=string(p.evidence,'人工逐页复核依据',4000),pages=r.pageTexts.map((p:Values)=>p.page===page?{...p,review:{textHash:digest(p.text),scanHash:r.file.sha256,nonTextConfirmed:p.nonTextPage===true,actorId:ctx.actorId,at:ctx.now,evidence}}:p);const result=ctx.update('books',r.id,{pageTexts:pages,pagesVerified:r.pagesVerified||p.pagesVerified===true,reviewed:[...new Set([...r.reviewed,page])].sort((a:any,b:any)=>a-b),rounds:r.rounds+1,audit:log(r,ctx,`第${page}页完成逐字人工复核：${evidence}`),updatedAt:ctx.now});ctx.emit('books',r.id,'page-reviewed',{page});return result;
 }
 if(command==='review-all'){
  ensure(p.pagesVerified===true&&Array.isArray(p.pages)&&p.pages.length===r.pages,'批量提交也必须提供每页人工复核依据、当前指纹及页序确认，不能一键代替逐页审核');ensure(r.doubts.every((d:Values)=>d.status==='resolved'),'仍有未裁决疑点');const seen=new Set<number>();const evidenceByPage=new Map<number,string>();for(const proof of p.pages){const n=pageNumber(r,proof.page),entry=r.pageTexts.find((p:Values)=>p.page===n);ensure(!seen.has(n)&&entry&&(entry.text?.trim()||nonTextRecorded(entry,r.file.sha256))&&(!entry.nonTextPage||proof.nonTextConfirmed===true)&&proof.confirmed===true&&proof.textHash===digest(entry.text)&&proof.scanHash===r.file.sha256,'批量复核缺页、重复页或当前原件／正文指纹不匹配');seen.add(n);evidenceByPage.set(n,string(proof.evidence,'本页逐字复核依据',4000));}ensure(seen.size===r.pages,'缺少逐页复核证据');const pages=r.pageTexts.map((entry:Values)=>({...entry,review:{textHash:digest(entry.text),scanHash:r.file.sha256,nonTextConfirmed:entry.nonTextPage===true,actorId:ctx.actorId,at:ctx.now,evidence:evidenceByPage.get(entry.page)}}));const result=ctx.update('books',r.id,{pageTexts:pages,pagesVerified:true,reviewed:[...seen].sort((a,b)=>a-b),rounds:r.rounds+1,audit:log(r,ctx,`批量登记 ${r.pages} 页各自的人工复核证据与当前指纹；未用机器审核代替人工。`),updatedAt:ctx.now});ctx.emit('books',r.id,'pages-reviewed',{pages:r.pages});return result;
 }
 if(command==='recheck'){const result=ctx.update('books',r.id,{rounds:r.rounds+1,audit:log(r,ctx,'登记一轮人工复查；未自动消除疑点或确认页面。'),updatedAt:ctx.now});ctx.emit('books',r.id,'manual-recheck');return result;}
 return fail('书籍命令不存在');
}};

const stories:DomainHandler={domain:'stories',commands:['create','review','update','favorite','listen','quiz','index','refresh','gaps'],execute(command,p,ctx){
 if(command==='create'){
  newly(ctx);const b=published(ctx,p.bookId),page=pageNumber(b,p.page),entry=b.pageTexts.find((p:Values)=>p.page===page),quote=string(p.quote,'原文引用',20000,true);ensure(entry?.text.includes(quote),'故事引用必须来自已发布版本的指定页原文');ensure(p.version===b.version,'引用版本已变化','CONFLICT',409);
  const quiz=p.quiz;ensure(quiz&&typeof quiz==='object','请填写故事练习','VALIDATION',400);const choices=strings(quiz.choices,'选项',2,8);ensure(choices.length===quiz.choices.length,'练习选项不能重复','VALIDATION',400);const r=ctx.create('stories',{kind:'story',title:string(p.title,'故事标题',300),book:b.id,page,chapter:optional(p.chapter)||'正文',version:b.version,released:false,dirty:false,status:'draft',topic:string(p.topic,'主题',200),duration:integer(p.duration,1,120,'讲解时长'),level:string(p.level,'难度',100),summary:string(p.summary,'故事摘要',4000),quote,sections:strings(p.sections,'讲解段落',1,40),connections:strings(p.connections??[],'关联概念',0,30),quiz:{question:string(quiz.question,'练习题',2000),choices,answer:integer(quiz.answer,0,choices.length-1,'正确答案'),explanation:string(quiz.explanation,'答案解释',4000)},favorites:[],progress:{},reviewHistory:[],createdAt:ctx.now,updatedAt:ctx.now});ctx.emit('stories',r.id,'draft-created',{bookId:b.id,version:b.version});return r;
 }
 const s=primary(ctx,'stories',p.storyId,'story'),b=published(ctx,s.book);
 if(command==='review'||command==='update'){
  ensure(p.confirmed===true,'请明确完成原文引用与解读复核');const evidence=string(p.evidence,'解读复核依据',4000),page=pageNumber(b,p.page??s.page),quote=string(p.quote??s.quote,'原文引用',20000,true);ensure(b.pageTexts.find((p:Values)=>p.page===page)?.text.includes(quote),'新版本引用不匹配，请修订故事引用');const sections=p.sections===undefined?s.sections:strings(p.sections,'解读段落',1,40);
  const r=ctx.update('stories',s.id,{released:true,dirty:false,status:'published',version:b.version,page,quote,sections,reviewHistory:[...s.reviewHistory,{at:ctx.now,actorId:ctx.actorId,evidence,version:b.version}],updatedAt:ctx.now});ctx.emit('stories',s.id,'reviewed',{version:b.version});return r;
 }
 readyStory(ctx,s.id);const profile=learner(ctx,p.profile),old=s.progress?.[profile]??{},same=old.version===s.version?old:{history:[...(old.history??[]),...(old.version?[old]:[])]};
 if(command==='favorite'){const favorites=new Set(s.favorites??[]);favorites.has(profile)?favorites.delete(profile):favorites.add(profile);const r=ctx.update('stories',s.id,{favorites:[...favorites],updatedAt:ctx.now});ctx.emit('stories',s.id,'favorite-changed',{profile});return r;}
 let progress:Values;
 if(command==='listen')progress={...same,listened:true,version:s.version,last:ctx.now,at:ctx.now};
 else if(command==='quiz'){const answer=integer(p.answer,0,s.quiz.choices.length-1,'选择答案'),correct=answer===s.quiz.answer;progress={...same,answer,correct,complete:correct,attempts:(same.attempts??0)+1,version:s.version,last:ctx.now,at:ctx.now,review:correct?'明天':'今天',reviewAt:new Date(Date.parse(ctx.now)+(correct?86400000:3600000)).toISOString()};}
 else fail('故事命令不存在');
 const r=ctx.update('stories',s.id,{progress:{...s.progress,[profile]:progress!},updatedAt:ctx.now});ctx.emit('stories',s.id,command,{profile,version:s.version});return r;
}};

export function familyLearningRecord(ctx:CommandContext,p:Values):BusinessRecord {
 newly(ctx);const profile=learner(ctx,p.profile),type=choice(p.type,['language','story','science','history','other'],'练习类型'),minutes=integer(p.minutes,0,480,'自行记录的练习分钟');
 ensure(Array.isArray(p.rounds)&&p.rounds.length<=100,'练习轮次无效','VALIDATION',400);
 const rounds=(p.rounds as Values[]).map(r=>({question:string(r.question,'实际练习问题',4000),answer:string(r.answer,'实际答句',4000)}));
 if(type==='language')ensure(rounds.length>0,'语言练习必须保存实际答句');
 const r=ctx.create('learning',{kind:'practice',profile,type,title:string(p.title,'练习名称',300),minutes,rounds,answers:rounds.map(r=>r.answer),corrections:[],score:null,source:'manual-practice',assessmentStatus:'not-assessed',time:ctx.now,status:'recorded',createdAt:ctx.now,updatedAt:ctx.now});ctx.emit('learning',r.id,'practice-recorded',{profile,type,rounds:rounds.length,minutes});return r;
}
const learning:DomainHandler={domain:'learning',commands:['create','refresh','remove','review','practice','gap-create','gap-accept','gap-state','plan','assign','progress','quiz'],execute(command,p,ctx){
 if(command==='practice')return familyLearningRecord(ctx,p);
 if(command==='gap-create'){newly(ctx);const r=ctx.create('learning',{kind:'gap',title:string(p.title,'补充建议',300),type:optional(p.type)||'知识缺口',state:'pending',score:null,reason:string(p.reason,'补充依据',4000),need:string(p.need,'所需内容',4000),impact:string(p.impact,'影响范围',4000),action:'由管理员决定补充方式',createdAt:ctx.now,updatedAt:ctx.now});ctx.emit('learning',r.id,'gap-created');return r;}
 if(command==='create'){
  newly(ctx);const profile=learner(ctx,p.profile),storyIds=strings(p.stories,'课次',1,100),versions=Object.fromEntries(storyIds.map(id=>[id,readyStory(ctx,id).version]));const r=ctx.create('learning',{kind:'course',profile,title:string(p.title,'课程名称',300),goal:string(p.goal,'学习目标',4000),structure:choice(p.structure,['theme','book','people'],'课程结构'),pace:choice(p.pace,['short','normal','long'],'学习节奏'),stories:storyIds,versions,created:ctx.now,status:'active',createdAt:ctx.now,updatedAt:ctx.now});ctx.emit('learning',r.id,'course-created',{profile,count:storyIds.length});return r;
 }
 const r=primary(ctx,'learning',p.courseId??p.gapId);
 if(command.startsWith('gap-')){
  ensure(r.kind==='gap','补充建议不存在');const patch=command==='gap-accept'?{state:'accepted',next:choice(p.next,['search','collect','story'],'下一步'),note:optional(p.note),acceptedAt:ctx.now}:{state:choice(p.state,['pending','deferred','ignored'],'建议状态')};const result=ctx.update('learning',r.id,{...patch,updatedAt:ctx.now});ctx.emit('learning',r.id,command,{state:patch.state});return result;
 }
 ensure(r.kind==='course'&&r.status!=='removed','课程已移除或不存在');const profile=learner(ctx,p.profile??r.profile);ensure(profile===r.profile,'学习者与课程不一致','FORBIDDEN',403);
 if(command==='remove'){const result=ctx.update('learning',r.id,{status:'removed',removedAt:ctx.now,updatedAt:ctx.now});ctx.emit('learning',r.id,'course-removed');return result;}
 if(command==='refresh'){const versions=Object.fromEntries(r.stories.map((id:string)=>[id,readyStory(ctx,id).version]));const result=ctx.update('learning',r.id,{versions,status:'active',updatedAt:ctx.now});ctx.emit('learning',r.id,'course-refreshed');return result;}
 if(command==='review'){const note=string(p.note,'复习记录',4000);for(const id of r.stories)ensure(readyStory(ctx,id).version===r.versions[id],'课程版本失效，先刷新课程');const result=ctx.update('learning',r.id,{reviews:[...(r.reviews??[]),{at:ctx.now,profile,note}],updatedAt:ctx.now});ctx.emit('learning',r.id,'review-recorded',{profile});return result;}
 return fail('学习命令不存在');
}};

export const knowledgeHandlers:DomainHandler[]=[sources,books,stories,learning];
export const knowledgeBookHandler=books;
