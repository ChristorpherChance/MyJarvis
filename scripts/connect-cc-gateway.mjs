/** Private file input only; credentials never enter logs, reports, command arguments, or the model. */
import {readFile,lstat,unlink,mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {withPlatform} from './managed-server-client.mjs';
const file=resolve('.secrets/cc-gateway-api-key.txt'),info=await lstat(file).catch(error=>{if(error.code==='ENOENT')return null;throw error;});let key;
if(info){if(!info.isFile()||info.isSymbolicLink()||info.nlink!==1||info.size>8192)throw Error('PRIVATE_KEY_FILE_INVALID');key=(await readFile(file,'utf8')).replace(/^\uFEFF/,'').trim();if(!key||/[\r\n]/.test(key))throw Error('PRIVATE_KEY_FILE_INVALID');}
await withPlatform(async({api})=>{
 const initial=await api('/api/settings/pi');
 const catalog=await api('/api/settings/pi/gateway/discover',{provider:'cc-gateway',...(key?{apiKey:key}:{})});
 const settings=await api('/api/settings/pi/gateways',{definition:{id:'cc-gateway',name:'IKVein 网关',baseUrl:'https://cc-gateway.ikvein.com',api:'anthropic-messages'},...(key?{apiKey:key}:{})});
 if(settings.provider!==initial.provider||settings.model!==initial.model||!settings.gateways.find(g=>g.id==='cc-gateway')?.credentialConfigured)throw Error('GATEWAY_PERSISTENCE_FAILED');
 const candidates=['Kimi-Coding/k3','DeepSeek/deepseek-v4-flash'].filter(id=>catalog.models.some(m=>m.id===id)),results=[];
 for(const model of candidates){results.push(await api('/api/settings/pi/test',{selection:{provider:'cc-gateway',model}}));}
 const passed=results.length===2&&results.every(r=>r.ok);if(passed&&info)await unlink(file);
 const report={at:new Date().toISOString(),provider:'cc-gateway',baseUrl:catalog.baseUrl,modelCount:catalog.models.length,models:catalog.models,defaultModel:{provider:settings.provider,model:settings.model},credentialSaved:true,privateFileRemoved:passed,tests:results,pricing:'unavailable'};
 await mkdir('artifacts/model-routing',{recursive:true});await writeFile('artifacts/model-routing/gateway-connection.json',JSON.stringify(report,null,2));
 if(!passed)throw Error('GATEWAY_CONVERSATION_FAILED_CREDENTIAL_SAVED');console.log(JSON.stringify({connected:true,modelCount:catalog.models.length,testedModels:results.map(r=>r.model),defaultPreserved:true,privateFileRemoved:true}));
});
