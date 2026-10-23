import type {FastifyInstance} from 'fastify';
import {constants} from 'node:fs';
import {lstat,open,realpath} from 'node:fs/promises';
import {relative,resolve,sep} from 'node:path';
import {z} from 'zod';
import {RuntimeAccessError,type IdentityRuntime,type RuntimePrincipal} from './identity.js';

const route='/api/runtime/server-planning/document';
const querySchema=z.object({resource:z.enum(['source','registration','preview-guide']).optional()}).strict();
const resourcePaths={source:'docs/服务器扩容与AI节点规划.md',registration:'apps/api/resources/server-planning/registration-public.json','preview-guide':'docs/AI配置只读差异预览.md'} as const;
const adminLogin='/?mode=platform#view=machines';
const pathKey=(path:string)=>process.platform==='win32'?path.toLowerCase():path;

async function readFixedFile(root:string,reference:string):Promise<string>{
 const target=resolve(root,...reference.split('/'));
 const check=async()=>{
  const rootInfo=await lstat(root);
  if(!rootInfo.isDirectory()||rootInfo.isSymbolicLink()||pathKey(await realpath(root))!==pathKey(root))throw new Error('UNSAFE');
  let cursor=root;let final;
  for(const [index,part] of reference.split('/').entries()){
   cursor=resolve(cursor,part);const info=await lstat(cursor),last=index===reference.split('/').length-1;
   if(info.isSymbolicLink()||pathKey(await realpath(cursor))!==pathKey(cursor)||(!last&&!info.isDirectory())||(last&&(!info.isFile()||info.nlink!==1)))throw new Error('UNSAFE');
   if(last)final=info;
  }
  return final!;
 };
 try{
  const before=await check(),handle=await open(target,constants.O_RDONLY|(constants.O_NOFOLLOW??0));
  try{
   const opened=await handle.stat(),current=await check();
   if(!opened.isFile()||opened.nlink!==1||opened.size>8*1024*1024||opened.dev!==before.dev||opened.ino!==before.ino||current.dev!==opened.dev||current.ino!==opened.ino)throw new Error('UNSAFE');
   const content=await handle.readFile('utf8'),after=await handle.stat(),latest=await check();
   if(after.dev!==opened.dev||after.ino!==opened.ino||after.size!==opened.size||after.mtimeMs!==opened.mtimeMs||after.ctimeMs!==opened.ctimeMs||latest.dev!==after.dev||latest.ino!==after.ino||latest.size!==after.size||latest.mtimeMs!==after.mtimeMs||latest.ctimeMs!==after.ctimeMs)throw new Error('CHANGED');
   return content;
  }finally{await handle.close();}
 }catch(error){
  if((error as NodeJS.ErrnoException).code==='ENOENT')throw new FileNotFoundError();
  throw error;
 }
}
class FileNotFoundError extends Error{}
const securityHeaders=(reply:any)=>reply.header('Cache-Control','private, no-store').header('X-Content-Type-Options','nosniff').header('Content-Security-Policy',"default-src 'none'; style-src 'unsafe-inline'; img-src data:; frame-ancestors 'none'; script-src 'none'");
const errorHtml=(title:string,text:string,login=false)=>`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><body><main><h1>${title}</h1><p>${text}</p>${login?`<p><a href="${adminLogin}">前往平台登录</a></p>`:''}</main></body></html>`;
function mapLocalLinks(html:string){
 const inert=html.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi,'').replace(/<button\b[^>]*>[\s\S]*?<\/button\s*>/gi,'');
 const links=new Map<string,string>([
  ['服务器扩容与AI节点规划.md','source'],
  ['../artifacts/fleet-onboarding/registration-public.json','registration'],
  ['AI配置只读差异预览.md','preview-guide'],
 ]);
 return inert.replace(/\bhref\s*=\s*(["'])(.*?)\1/gi,(whole,quote:string,raw:string)=>{
  let decoded=raw;try{decoded=decodeURIComponent(raw.replace(/&amp;/g,'&'));}catch{return whole;}
  const resource=links.get(raw)??links.get(decoded);
  return resource?`href="${route}?resource=${resource}"`:whole;
 });
}
export function registerServerPlanningRoutes(app:FastifyInstance,identity:IdentityRuntime,workspaceRoot:string):void{
 app.get(route,async(req:any,reply:any)=>{
  const sendHtml=(status:number,title:string,text:string,login=false)=>securityHeaders(reply).code(status).type('text/html; charset=utf-8').send(errorHtml(title,text,login));
  let principal:RuntimePrincipal;
  try{principal=identity.principal(req);}catch(error){if(error instanceof RuntimeAccessError)return sendHtml(401,'需要管理员登录','请登录后查看服务器规划文档。',true);throw error;}
  if(!principal.administrator||principal.profileId!=='me')return sendHtml(403,'无权访问','此文档仅供管理员查看。');
  try{
   const query=querySchema.parse(req.query);
   const root=resolve(workspaceRoot),htmlPath=resolve(root,'docs/服务器扩容与AI节点规划.html');
   if(!query.resource){
    const html=await readFixedFile(root,relative(root,htmlPath).split(sep).join('/'));
    if(!identity.isPrincipalCurrent(principal))return sendHtml(401,'需要管理员登录','请重新登录后查看服务器规划文档。',true);
    return securityHeaders(reply).type('text/html; charset=utf-8').send(mapLocalLinks(html));
   }
   const reference=resourcePaths[query.resource];
   let content:string;
   try{content=await readFixedFile(root,reference);}catch(error){if(error instanceof FileNotFoundError)return sendHtml(404,'文档暂不可用','请求的公开规划资源尚未部署。');throw error;}
   if(!identity.isPrincipalCurrent(principal))return sendHtml(401,'需要管理员登录','请重新登录后查看服务器规划文档。',true);
   const type=reference.endsWith('.json')?'application/json; charset=utf-8':'text/plain; charset=utf-8';
   return securityHeaders(reply).type(type).send(content);
  }catch(error){
   if(error instanceof z.ZodError)return sendHtml(400,'请求无效','请使用允许的规划文档资源名称。');
   if(error instanceof FileNotFoundError)return sendHtml(404,'文档暂不可用','请求的公开规划资源尚未部署。');
   return sendHtml(404,'文档暂不可用','请求的公开规划资源无法读取。');
  }
 });
}
