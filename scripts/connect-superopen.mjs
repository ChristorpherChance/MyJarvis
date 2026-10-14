/** Run only after the user provides the private file; no credential in argv/output. */
import {readFile,lstat,unlink,mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {withPlatform} from './managed-server-client.mjs';
const path=resolve('.secrets/superopen-api-key.txt'),info=await lstat(path).catch(e=>{if(e.code==='ENOENT')return null;throw e;});
let key;
if(info){if(!info.isFile()||info.isSymbolicLink()||info.size>8192||info.nlink!==1)throw Error('PRIVATE_KEY_FILE_INVALID');key=(await readFile(path,'utf8')).replace(/^\uFEFF/,'').trim();if(!key||/[\r\n]/.test(key))throw Error('PRIVATE_KEY_FILE_INVALID');}
await withPlatform(async({api})=>{
 const catalog=await api('/api/settings/pi/gateway/discover',key?{apiKey:key}:{});
 const preferred=['gpt-6.1-sol','claude-sonnet-4-6','gpt-6-sol','claude-sonnet-4-5','claude-sonnet-4','sonnet','default'];
 const selected=preferred.map(id=>catalog.models.find(m=>m.id===id||m.id.split('/').at(-1)?.trim()===id)).find(Boolean)??catalog.models.find(m=>/sonnet/i.test(m.id))??catalog.models[0];
 if(!selected)throw Error('GATEWAY_NO_MODEL');
 const settings=await api('/api/settings/pi',{provider:'superopen',model:selected.id,...(key?{apiKey:key}:{})},'PUT');
 if(!settings.configured)throw Error('GATEWAY_AUTH_NOT_PERSISTED');
 if(info)await unlink(path);
 const test=await api('/api/settings/pi/test',{});
 const report={at:new Date().toISOString(),baseUrl:catalog.baseUrl,api:catalog.api,modelCount:catalog.models.length,selectedModel:selected.id,credentialSaved:true,privateFileRemoved:true,actualConversation:test,pricing:'unavailable'};
 await mkdir('artifacts/power-gateway',{recursive:true});await writeFile('artifacts/power-gateway/model-connection.json',JSON.stringify(report,null,2));
 if(!test.ok)throw Error('GATEWAY_CONVERSATION_FAILED_CREDENTIAL_SAVED');
 console.log(JSON.stringify({connected:true,model:selected.id,modelCount:catalog.models.length,actualConversationVerified:true,privateFileRemoved:true}));
});
