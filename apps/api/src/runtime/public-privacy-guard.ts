import {BusinessError} from '../v1/types.js';
import {redactExecutionLog} from './execution-runtime.js';

/** Reject private material before data is persisted into public decision/event/intent projections. */
export function assertPublicSupervisorContent(value:unknown):void {
 const inspect=(item:unknown)=>{
  if(typeof item==='string'){
   if(redactExecutionLog(item)!==item||/\b(?:password|api[_-]?key|access[_-]?token|client[_-]?secret|private[_-]?key)\s+(?:is|为|是)\s+\S+/i.test(item)||/(?:密码|密钥|令牌|口令)\s*[:：=]\s*\S+/i.test(item))throw new BusinessError('PRIVATE_CONTENT','内容包含疑似凭据，不能写入公开记录',400);
   if(/(?:^|[\\/])(?:\.secrets|\.jarvis-dev|private|credentials|\.ssh)(?:[\\/]|$)/i.test(item)||/(?:^|\s)~\/(?:\.|[^\s]*\.(?:pem|key|env))(?:\/|\b)/i.test(item)||/(?:^|\s)\/(?:home\/[^/]+\/(?:\.ssh|\.secrets|\.jarvis-dev)|root\/(?:\.ssh|\.secrets)|etc\/(?:shadow|[^\s]*credentials))(?:\/|\b)/i.test(item))throw new BusinessError('PRIVATE_CONTENT','内容包含私人路径，不能写入公开记录',400);
   for(const match of item.matchAll(/https?:\/\/[^\s<>"']+/gi)){
    try{const url=new URL(match[0]);if(url.username||url.password||[...url.searchParams.keys()].some(k=>/token|secret|password|key|cookie|auth/i.test(k)))throw new BusinessError('PRIVATE_CONTENT','链接包含访问参数，不能写入公开记录',400);}catch(error){if(error instanceof BusinessError)throw error;}
   }
  }else if(Array.isArray(item))item.forEach(inspect);else if(item&&typeof item==='object')Object.values(item).forEach(inspect);
 };
 inspect(value);
 if(Buffer.byteLength(JSON.stringify(value),'utf8')>192*1024)throw new BusinessError('PRIVATE_CONTENT','公开记录超过保存范围',400);
}
