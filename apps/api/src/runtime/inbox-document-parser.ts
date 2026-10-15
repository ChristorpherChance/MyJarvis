import {spawn,execFile} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {BusinessError} from '../v1/types.js';
import {validateOcrPass,type OcrPass} from './knowledge-ocr.js';

const MAX_BYTES=32*1024*1024,MAX_TEXT=120000,MAX_PAGES=20,MAX_TIMEOUT=120000;
const DOCX='application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const allowed=new Set(['application/pdf','image/png','image/jpeg','image/webp',DOCX,'text/html']);
const docxWorker=fileURLToPath(new URL('../../resources/inbox-runtime/docx_worker.py',import.meta.url));
const htmlWorker=fileURLToPath(new URL('../../resources/inbox-runtime/html_worker.py',import.meta.url));
const scanWorker=fileURLToPath(new URL('../../resources/knowledge-runtime/scan_worker.py',import.meta.url));
const hash=(value:Buffer|string)=>createHash('sha256').update(value).digest('hex');
export interface InboxDocumentSegment {page:number|null;paragraph:number|null;text:string;location:string;sha256:string}
export interface InboxDocumentResult {sha256:string;mime:string;engine:string;segments:InboxDocumentSegment[];text:string;textTruncated:boolean;warnings:string[];reviewRequired:true;pageCount:number|null;title?:string}
export interface InboxDocumentInput {bytes:Buffer;mime:string;sha256:string;pythonExecutable:string;signal?:AbortSignal;maxPages?:number;timeoutMs?:number}
interface RawDocument {engine:string;pageCount:number|null;segments:{page:number|null;paragraph:number|null;text:string}[];warnings:string[];textTruncated?:boolean;title?:string}
function boundedText(value:string,limit:number){let text=value.slice(0,limit);if(text.length<value.length&&/[\uD800-\uDBFF]$/.test(text))text=text.slice(0,-1);return text;}
function output(input:InboxDocumentInput,result:RawDocument):InboxDocumentResult {
 const segments:InboxDocumentSegment[]=[],texts:string[]=[];let length=0,truncated=result.textTruncated===true;
 for(const source of result.segments){
  const separator=texts.length?2:0,remaining=MAX_TEXT-length-separator;
  if(remaining<0||remaining===0&&source.text){truncated=true;break;}
  const text=boundedText(source.text,Math.max(0,remaining));
  if(text.length<source.text.length)truncated=true;
  const part=source.page===null?`paragraph/${source.paragraph}`:`page/${source.page}`;
  segments.push({...source,text,location:`inbox-original://${input.sha256}/${part}`,sha256:hash(text)});texts.push(text);length+=separator+text.length;
  if(truncated&&text.length<source.text.length)break;
 }
 if(segments.length<result.segments.length)truncated=true;
 const warnings=[...result.warnings];if(truncated)warnings.push('检索正文达到120000字符上限，后续内容未纳入；完整原件保持不变。');if(!texts.join('').trim())warnings.push('未提取到文字；不能据此断言原件没有文字，请人工回查。');
 warnings.push('机器提取结果尚未逐字人工核对，不能作为已校对原文发布。');
 return {sha256:input.sha256,mime:input.mime,engine:result.engine,segments,text:texts.join('\n\n'),textTruncated:truncated,warnings:[...new Set(warnings)].slice(0,50),reviewRequired:true,pageCount:result.pageCount,...(result.title?{title:result.title}:{})};
}
function docxPass(path:string,input:InboxDocumentInput,timeoutMs:number,signal:AbortSignal):Promise<RawDocument>{
 return new Promise((resolve,reject)=>{
  const isHtml=input.mime==='text/html',child=spawn(input.pythonExecutable,[isHtml?htmlWorker:docxWorker,'--input',path],{shell:false,windowsHide:true,stdio:['ignore','pipe','pipe'],env:{...process.env,PYTHONIOENCODING:'utf-8'}});
  const chunks:Buffer[]=[],diagnostics:Buffer[]=[];let size=0,errorSize=0,settled=false,failure:BusinessError|undefined;
  const finish=(error?:unknown,result?:RawDocument)=>{if(settled)return;settled=true;clearTimeout(timer);signal.removeEventListener('abort',abort);error?reject(error):resolve(result!);};
  const terminate=()=>{if(!child.pid||child.exitCode!==null)return;if(process.platform==='win32')execFile('taskkill',['/PID',String(child.pid),'/T','/F'],{windowsHide:true},()=>{});else child.kill('SIGKILL');};
  const abort=()=>{failure=new BusinessError('CANCELLED','文档解析已取消，原件保持不变',409);terminate();};
  const timer=setTimeout(()=>{failure=new BusinessError('DOCUMENT_PARSE_TIMEOUT','文档解析超过本轮时限，原件保持不变',504);terminate();},timeoutMs);
  signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();
  child.stdout.on('data',(chunk:Buffer)=>{size+=chunk.length;if(size>2*1024*1024){failure=new BusinessError('DOCUMENT_PARSE_LIMIT','文档解析输出超过限制',413);terminate();}else chunks.push(chunk);});
  child.stderr.on('data',(chunk:Buffer)=>{errorSize+=chunk.length;if(errorSize>65536){failure=new BusinessError('DOCUMENT_PARSE_LIMIT','文档解析诊断超过限制',413);terminate();}else diagnostics.push(chunk);});
  child.once('error',()=>finish(new BusinessError('NOT_CONFIGURED','本地文档解析无法启动，请检查Python环境',503)));
  child.once('close',code=>{
   if(failure){finish(failure);return;}
   if(code!==0){let reason=isHtml?'HTML_INVALID':'DOCX_INVALID';try{const diagnostic=JSON.parse(Buffer.concat(diagnostics).toString('utf8').trim().split(/\r?\n/).at(-1)!);if(['DOCX_LIMIT','DOCX_INVALID','DOCX_XML_UNSAFE','DOCX_ENCRYPTED','HTML_INVALID','HTML_LIMIT','HTML_INVALID_UTF8'].includes(diagnostic.code))reason=diagnostic.code;}catch{}
    const message=reason==='DOCX_LIMIT'?'DOCX条目、解压大小、XML结构或段落数超过限制':reason==='DOCX_XML_UNSAFE'?'DOCX包含不允许的DTD或实体声明':reason==='DOCX_ENCRYPTED'?'DOCX含加密条目，请提供未加密原件':reason==='HTML_LIMIT'?'HTML结构或原件大小超过解析限制':reason==='HTML_INVALID_UTF8'?'HTML原件必须为有效UTF-8，未猜测编码或替换坏字节':reason==='HTML_INVALID'?'HTML原件无法解析':'DOCX文件损坏或不是受支持的正文文档';finish(new BusinessError(reason,message,reason.endsWith('_LIMIT')?413:422));return;
   }
   try{
    const result=JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if(result?.engine!==(isHtml?'python-stdlib-html':'python-stdlib-docx-body')||result.pageCount!==null||!Array.isArray(result.segments)||result.segments.length>2000||typeof result.textTruncated!=='boolean'||!Array.isArray(result.warnings)||result.warnings.length>20||result.title!==undefined&&(typeof result.title!=='string'||result.title.length>1000))throw Error();
    let previous=0,total=0;for(const segment of result.segments){if(segment?.page!==null||!Number.isInteger(segment.paragraph)||segment.paragraph<=previous||segment.paragraph>2000||typeof segment.text!=='string'||segment.text.length>MAX_TEXT*2)throw Error();previous=segment.paragraph;total+=segment.text.length;}
    if(total>MAX_TEXT*2||result.warnings.some((value:unknown)=>typeof value!=='string'||value.length>1000))throw Error();
    finish(undefined,result);
   }catch{finish(new BusinessError('DOCUMENT_PARSE_INVALID_RESULT','本地文档解析返回格式无效',502));}
  });
 });
}
/** Same owned scan worker and validated protocol, but settle only after its process closes. */
function scanPass(path:string,input:InboxDocumentInput,maxPages:number,timeoutMs:number,signal:AbortSignal):Promise<OcrPass>{
 return new Promise((resolve,reject)=>{
  const child=spawn(input.pythonExecutable,[scanWorker,'--input',path,'--mime',input.mime,'--round','1','--max-pages',String(maxPages),'--cpu-threads','2','--engine','rapidocr','--language','chi_sim+eng'],{shell:false,windowsHide:true,stdio:['ignore','pipe','pipe'],env:{...process.env,PYTHONIOENCODING:'utf-8',OMP_NUM_THREADS:'2',OPENBLAS_NUM_THREADS:'2',MKL_NUM_THREADS:'2',NUMEXPR_NUM_THREADS:'2',VECLIB_MAXIMUM_THREADS:'2'}});
  const chunks:Buffer[]=[],diagnostics:Buffer[]=[];let size=0,errorSize=0,settled=false,failure:BusinessError|undefined;
  const finish=(error?:unknown,result?:OcrPass)=>{if(settled)return;settled=true;clearTimeout(timer);signal.removeEventListener('abort',abort);error?reject(error):resolve(result!);};
  const terminate=()=>{if(!child.pid||child.exitCode!==null)return;if(process.platform==='win32')execFile('taskkill',['/PID',String(child.pid),'/T','/F'],{windowsHide:true},()=>{});else child.kill('SIGKILL');};
  const abort=()=>{failure=new BusinessError('CANCELLED','文档识别已取消，原件保持不变',409);terminate();};
  const timer=setTimeout(()=>{failure=new BusinessError('OCR_TIMEOUT','本轮本地识别超过执行时限，原件保持不变',504);terminate();},timeoutMs);
  signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();
  child.stdout.on('data',(chunk:Buffer)=>{size+=chunk.length;if(size>24*1024*1024){failure=new BusinessError('OCR_INVALID_RESULT','识别输出超过限制',413);terminate();}else chunks.push(chunk);});
  child.stderr.on('data',(chunk:Buffer)=>{errorSize+=chunk.length;if(errorSize>512*1024){failure=new BusinessError('OCR_ENGINE_ERROR','识别诊断输出超过限制',502);terminate();}else diagnostics.push(chunk);});
  child.once('error',()=>finish(new BusinessError('OCR_ENGINE_ERROR','本地Python识别无法启动，请检查隔离运行环境',502)));
  child.once('close',code=>{
   if(failure){finish(failure);return;}
   if(code!==0){let detail='';for(const line of Buffer.concat(diagnostics).toString('utf8').trim().split(/\r?\n/).reverse()){try{const diagnostic=JSON.parse(line);if(/^[A-Za-z]{1,50}$/.test(diagnostic.error??'')&&/^[a-z-]{1,50}$/.test(diagnostic.stage??'')){detail=`（${diagnostic.stage}: ${diagnostic.error}）`;break;}}catch{}}
    finish(new BusinessError('OCR_ENGINE_ERROR','本地识别未完成'+detail+'，请核对依赖、限制与原件',502));return;
   }
   try{finish(undefined,validateOcrPass(JSON.parse(Buffer.concat(chunks).toString('utf8')),1,maxPages))}catch(error){finish(error);}
  });
 });
}
/** Parse immutable original bytes locally. No network, models, publishing or original-file mutation. */
export async function parseInboxDocument(input:InboxDocumentInput):Promise<InboxDocumentResult>{
 if(!Buffer.isBuffer(input.bytes)||input.bytes.length<1||input.bytes.length>MAX_BYTES)throw new BusinessError('VALIDATION','请选择1字节至32MiB的文档原件',400);
 if(typeof input.sha256!=='string'||!/^[a-f0-9]{64}$/.test(input.sha256)||hash(input.bytes)!==input.sha256)throw new BusinessError('CONFLICT','原件SHA256不一致，解析已停止',409);
 if(!allowed.has(input.mime))throw new BusinessError('VALIDATION','此入口仅解析PDF、DOCX、HTML或受支持图片',400);
 const maxPages=input.maxPages??MAX_PAGES,timeoutMs=input.timeoutMs??MAX_TIMEOUT;
 if(!Number.isInteger(maxPages)||maxPages<1||maxPages>MAX_PAGES||!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>MAX_TIMEOUT)throw new BusinessError('VALIDATION','文档解析页数或时限配置超出限制',400);
 if(typeof input.pythonExecutable!=='string'||!input.pythonExecutable.trim())throw new BusinessError('NOT_CONFIGURED','尚未配置本地Python文档解析环境',503);
 const signal=input.signal??new AbortController().signal;if(signal.aborted)throw new BusinessError('CANCELLED','文档解析已取消，原件保持不变',409);
 const directory=await mkdtemp(join(tmpdir(),'jarvis-inbox-document-')),path=join(directory,'original.bin');
 try{
  await writeFile(path,input.bytes,{mode:0o600,flag:'wx'});if(signal.aborted)throw new BusinessError('CANCELLED','文档解析已取消，原件保持不变',409);
  if(input.mime===DOCX||input.mime==='text/html')return output(input,await docxPass(path,input,timeoutMs,signal));
  const result=await scanPass(path,input,maxPages,timeoutMs,signal);
  return output(input,{engine:[...new Set(result.pages.map(page=>page.engine))].join('+'),pageCount:result.pageCount,segments:result.pages.map(page=>({page:page.page,paragraph:null,text:page.text})),warnings:result.pages.flatMap(page=>page.warnings)});
 }finally{
  const target=resolve(directory);if(!target.startsWith(resolve(tmpdir())+sep)||!target.includes('jarvis-inbox-document-'))throw new Error('Unexpected document scratch directory');
  await rm(target,{recursive:true,force:true,maxRetries:10,retryDelay:100});
 }
}
