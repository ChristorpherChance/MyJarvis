import type {FastifyInstance} from 'fastify';
import {lstat,open,realpath} from 'node:fs/promises';
import {constants} from 'node:fs';
import {dirname,relative,resolve,sep} from 'node:path';
import {z} from 'zod';
import {BusinessError} from '../v1/types.js';
import {RuntimeAccessError,type IdentityRuntime} from './identity.js';
import type {ProjectAutonomyRuntime} from './project-autonomy-runtime.js';

const command=z.object({commandId:z.string().uuid(),expectedVersion:z.number().int().nonnegative(),reason:z.string().trim().min(1).max(1000)}).strict();
const guideQuery=z.object({reference:z.string().min(1).max(2000).optional()}).strict();
const guideRoute='/api/v1/project-autonomy/guide';
const acceptancePlanRoute='/api/v1/project-autonomy/acceptance-plan';
const publicResource=(reference:string)=>{
 if(/[\\\u0000-\u001f\u007f:%?#]/.test(reference))return false;
 const parts=reference.split('/');
 if(parts.some(p=>!p||p.startsWith('.')||/(?:^|[-_.])(?:private|secrets?|credentials?)(?:$|[-_.])/i.test(p)))return false;
 return /^docs\/(?:[^/]+\/)*[^/]+\.(?:md|html)$/.test(reference)||/^artifacts\/software-factory\/(?:[^/]+\/)*[^/]+\.json$/.test(reference);
};
const pathKey=(path:string)=>process.platform==='win32'?path.toLowerCase():path;
/** Only the trusted main HTML builds the finite allowlist; referenced files never extend it. */
function guideResources(html:string,root:string,guidePath:string,route=guideRoute){
 const allowed=new Set<string>(),links=new Map<string,string>();
 const mainMD=relative(root,guidePath.replace(/\.html$/i,'.md')).split(sep).join('/');
 if(publicResource(mainMD))allowed.add(mainMD);
 for(const match of html.matchAll(/\bhref\s*=\s*(["'])(.*?)\1/gi)){
  const raw=match[2];
  if(!raw||raw.startsWith('#')||/^(?:[a-z][a-z0-9+.-]*:|\/|\\)/i.test(raw))continue;
  try{
   const decoded=decodeURIComponent(raw.replace(/&amp;/g,'&'));
   if(/[\\\u0000-\u001f\u007f:%?#]/.test(decoded))continue;
   const target=resolve(dirname(guidePath),decoded),reference=relative(root,target).split(sep).join('/');
   if(!publicResource(reference))continue;
   allowed.add(reference);links.set(raw,reference);
  }catch{/* Malformed and external links never grant file access. */}
 }
 return {allowed,render:(content:string)=>content.replace(/\bhref\s*=\s*(["'])(.*?)\1/gi,(whole,quote:string,raw:string)=>{
  const reference=links.get(raw);
  return reference?'href='+quote+route+'?reference='+encodeURIComponent(reference)+quote:whole;
 })};
}
/** Check every ancestor and the opened file, then confirm the identity after reading. */
async function readGuideResource(root:string,reference:string):Promise<string>{
 if(!publicResource(reference))throw new BusinessError('INVALID_GUIDE_REFERENCE','文档路径不符合公开资源规则',400);
 const target=resolve(root,...reference.split('/'));
 const checked=async()=>{
  const rootInfo=await lstat(root);
  if(!rootInfo.isDirectory()||rootInfo.isSymbolicLink()||pathKey(await realpath(root))!==pathKey(root))throw new BusinessError('GUIDE_RESOURCE_FORBIDDEN','文档目录不允许重定向',403);
  let cursor=root;const parts=reference.split('/');
  for(const [index,part] of parts.entries()){
   cursor=resolve(cursor,part);const info=await lstat(cursor),last=index===parts.length-1;
   if(info.isSymbolicLink()||pathKey(await realpath(cursor))!==pathKey(cursor)||(!last&&!info.isDirectory())||(last&&(!info.isFile()||info.nlink!==1)))throw new BusinessError('GUIDE_RESOURCE_FORBIDDEN','文档资源不允许链接或重定向',403);
   if(last)return info;
  }
  throw new BusinessError('INVALID_GUIDE_REFERENCE','文档路径无效',400);
 };
 try{
  const before=await checked(),handle=await open(target,constants.O_RDONLY|(constants.O_NOFOLLOW??0));
  try{
   const opened=await handle.stat(),current=await checked();
   if(!opened.isFile()||opened.nlink!==1||opened.size>8*1024*1024||opened.dev!==before.dev||opened.ino!==before.ino||current.dev!==opened.dev||current.ino!==opened.ino)throw new BusinessError('GUIDE_RESOURCE_FORBIDDEN','文档资源已改变或超过读取范围',403);
   const content=await handle.readFile('utf8'),after=await handle.stat(),latest=await checked();
   if(after.dev!==opened.dev||after.ino!==opened.ino||after.size!==opened.size||after.mtimeMs!==opened.mtimeMs||after.ctimeMs!==opened.ctimeMs||latest.dev!==after.dev||latest.ino!==after.ino||latest.size!==after.size||latest.mtimeMs!==after.mtimeMs||latest.ctimeMs!==after.ctimeMs)throw new BusinessError('GUIDE_RESOURCE_CHANGED','文档资源读取时发生变化，请重试',409);
   return content;
  }finally{await handle.close();}
 }catch(error){
  if((error as NodeJS.ErrnoException).code==='ENOENT')throw new BusinessError('GUIDE_RESOURCE_NOT_FOUND','引用的公开文档尚未部署',404);
  if((error as NodeJS.ErrnoException).code==='ELOOP')throw new BusinessError('GUIDE_RESOURCE_FORBIDDEN','文档资源不允许链接',403);
  throw error;
 }
}
export function registerProjectAutonomyRoutes(app:FastifyInstance,runtime:ProjectAutonomyRuntime,identity:IdentityRuntime,guidePath:string) {
 const handle=(fn:(req:any,reply:any)=>unknown)=>async(req:any,reply:any)=>{try{const principal=identity.principal(req);if(!principal.administrator||principal.profileId!=='me')throw new RuntimeAccessError('ADMIN_REQUIRED','请先以管理员登录',403);return await fn(req,reply);}catch(error){if(error instanceof BusinessError)return reply.code(error.status).send({error:{code:error.code,message:error.message}});if(error instanceof RuntimeAccessError)return reply.code(error.statusCode).send({error:{code:error.code,message:error.message}});if(error instanceof z.ZodError)return reply.code(400).send({error:{code:'INVALID_INPUT',message:'监督配置格式不正确'}});throw error;}};
 app.get('/api/v1/project-autonomy',handle(()=>({data:runtime.list()})));
 for(const [route,document] of [[guideRoute,guidePath],[acceptancePlanRoute,resolve(dirname(guidePath),'软件工厂现有成果验收与修复计划.html')]])app.get(route,handle(async(req,reply)=>{
  const {reference}=guideQuery.parse(req.query),path=resolve(document),root=resolve(dirname(path),'..');
  const mainReference=relative(root,path).split(sep).join('/'),main=await readGuideResource(root,mainReference),resources=guideResources(main,root,path,route);
  reply.header('Cache-Control','private, no-store').header('X-Content-Type-Options','nosniff');
  if(reference===undefined)return reply.type('text/html; charset=utf-8').send(resources.render(main));
  if(!publicResource(reference))throw new BusinessError('INVALID_GUIDE_REFERENCE','文档路径不符合公开资源规则',400);
  if(!resources.allowed.has(reference))throw new BusinessError('GUIDE_RESOURCE_FORBIDDEN','该文件未列入总纲公开引用',403);
  const content=await readGuideResource(root,reference);
  return reply.type(reference.endsWith('.json')?'application/json; charset=utf-8':reference.endsWith('.html')?'text/html; charset=utf-8':'text/plain; charset=utf-8').send(content);
 }));
 app.get('/api/v1/projects/:id/autonomy',handle(req=>({data:runtime.get(req.params.id)})));
 app.get('/api/v1/projects/:id/autonomy/events',handle(req=>{const q=z.object({after:z.coerce.number().int().nonnegative().default(0),limit:z.coerce.number().int().min(1).max(1000).default(100)}).parse(req.query);return {data:runtime.events(req.params.id,q.after,q.limit)};}));
 app.put('/api/v1/projects/:id/autonomy',handle(req=>({data:runtime.configure(req.params.id,z.object({spec:z.unknown(),config:z.unknown(),expectedVersion:z.number().int().nonnegative(),commandId:z.string().uuid()}).strict().parse(req.body))})));
 for(const action of ['start','pause','cancel'] as const)app.post('/api/v1/projects/:id/autonomy/'+action,handle(async req=>({data:await runtime.control(req.params.id,action,command.parse(req.body))})));
 app.post('/api/v1/projects/:id/autonomy/recover',handle(req=>({data:runtime.recover(req.params.id,req.body)})));
 app.get('/api/v1/projects/:id/autonomy/baselines',handle(req=>{const q=z.object({offset:z.coerce.number().int().nonnegative().default(0),limit:z.coerce.number().int().min(1).max(100).default(25)}).strict().parse(req.query);return {data:runtime.baselines(req.params.id,q.offset,q.limit)};}));
 app.get('/api/v1/projects/:id/autonomy/baselines/:batchId',handle(req=>({data:runtime.baseline(req.params.id,req.params.batchId)})));
 app.post('/api/v1/projects/:id/autonomy/baselines',handle(req=>({data:runtime.registerBaseline(req.params.id,req.body)})));
}
