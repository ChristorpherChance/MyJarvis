import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtempSync,chmodSync,statSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {canonical,hash,validatePolicy,validateRequest,encryptVault,decryptVault,sanitizeInventory,atomic} from './controller.mjs';

const profile={id:'linux-ai-dev-v1',revision:1,name:'终端 AI 开发',tools:[{name:'claude',version:'2.1.292'}],providers:[{id:'kimi-k3',name:'K3 通道',model:'k3[1M]',credentialConfigured:true}],statuslineVersion:'1'};
const policy={version:1,profiles:[profile],nodes:[{machineId:'fd4b32f6-2fc7-409e-a8d3-3774035181e6',nodeId:'112',address:'192.168.10.112',targetUser:'superopen',profileIds:[profile.id]}]};
const legacy={nodes:[{...policy.nodes[0],alias:'ops-112'}]};
function request(){const now=Date.now(),binding={machineId:policy.nodes[0].machineId,machineRevision:2,address:'192.168.10.112',nodeId:'112',targetUser:'superopen',action:'configure',profileId:profile.id,profileRevision:1,profileHash:hash(profile),policyHash:hash(policy)};return {schemaVersion:1,id:randomUUID(),commandId:randomUUID(),...binding,bindingHash:hash(binding),createdAt:new Date(now).toISOString(),expiresAt:new Date(now+900000).toISOString(),actorId:'fixture-admin',authorizationHash:'a'.repeat(64),profile};}

test('canonical public profile uses recursive sorted UTF8, preserving array order',()=>{
 assert.equal(canonical({z:'中文',a:[{z:2,a:1},null]}),'{"a":[{"a":1,"z":2},null],"z":"中文"}');
 assert.equal(hash({a:1,b:'中文'}),hash({b:'中文',a:1}));assert.notEqual(hash([1,2]),hash([2,1]));
});
test('vault authenticates key, ciphertext and fixed AAD and never contains plaintext',()=>{
 const secrets={profiles:{'linux-ai-dev-v1':{providers:[{settingsConfig:{env:{ANTHROPIC_AUTH_TOKEN:'fixture-private-key'}}}]}}};
 const {key,vault}=encryptVault(secrets);assert.deepEqual(decryptVault(vault,key),secrets);assert(!JSON.stringify(vault).includes('fixture-private-key'));
 const bad={...vault,tag:Buffer.alloc(16).toString('base64')};assert.throws(()=>decryptVault(bad,key));assert.throws(()=>decryptVault(vault,Buffer.alloc(32)));
});
test('request binds actual policy/profile/node/user/expiry; unsafe inputs reject',()=>{
 validatePolicy(policy);const r=request();assert.equal(validateRequest(r,policy,legacy).alias,'ops-112');
 for(const change of [{targetUser:'root'},{address:'other'},{profileHash:'b'.repeat(64)},{bindingHash:'c'.repeat(64)},{shell:'id'}])assert.throws(()=>validateRequest({...r,...change},policy,legacy));
 assert.throws(()=>validateRequest({...r,expiresAt:new Date(Date.now()-1).toISOString()},policy,legacy));
 const altered=structuredClone(policy);altered.profiles[0].providers[0].model='other';assert.throws(()=>validateRequest(r,altered,legacy));
 const malformed=structuredClone(policy);malformed.nodes[0].machineId='../../path';assert.throws(()=>validatePolicy(malformed));
});
test('inventory is projected and usage stays unknown/null without native evidence',()=>{
 const i=sanitizeInventory({tools:[{name:'claude',version:null,installed:true,path:'/home/fixture/.local/bin/claude',matchesPinned:false,env:{TOKEN:'never-public'}}],providers:[{id:'kimi-k3',name:'K3',model:null,credentialConfigured:true,current:true,settingsConfig:{env:{TOKEN:'never-public'}}}],statusline:{configured:false,commandSHA256:null,scope:'global-and-provider',resources:true,diagnosticsVersion:1,layers:{script:'match',global:'unknown',common:'missing',currentProvider:'not-applicable'},providers:{total:1,matched:0,missing:0,different:0,invalid:0,unknown:1},reasonCodes:['STATUSLINE_SCRIPT_MATCH','STATUSLINE_GLOBAL_UNKNOWN','STATUSLINE_COMMON_MISSING','STATUSLINE_CURRENT_PROVIDER_NOT_APPLICABLE','STATUSLINE_PROVIDER_COUNT_UNKNOWN','STATUSLINE_PROVIDER_COUNT_MATCHED'],privatePath:'/private/settings.json',command:'private command',secret:'never-public'},resources:{cpuPercent:null,ramTotalBytes:100,diskFreeBytes:10,secret:'never-public'},sessionSummary:{observedAt:new Date().toISOString(),sessionId:null,model:null,provider:null,contextTokens:null,sessionCostUSD:null,billingStatus:'unknown',transcript:'never-public'},settingsConfig:{env:{TOKEN:'never-public'}}});
 assert(!JSON.stringify(i).includes('never-public'));assert(!JSON.stringify(i).includes('privatePath'));assert(!JSON.stringify(i).includes('private command'));assert.deepEqual(i.statusline.layers,{script:'match',global:'unknown',common:'missing',currentProvider:'not-applicable'});assert.equal(i.statusline.providers.unknown,1);assert.equal(i.tools[0].version,null);assert.equal(i.terminalTelemetry.billingStatus,'unknown');assert.equal(i.terminalTelemetry.contextTokens,null);assert.equal(i.terminalTelemetry.sessionCostUSD,null);assert(!('sessionInputTokens' in i.terminalTelemetry));
});
test('statusline diagnostics are allowlisted and legacy observations remain unobserved',()=>{
 const value={tools:[],providers:[],statusline:{configured:true,commandSHA256:'a'.repeat(64),diagnosticsVersion:1,layers:{script:'invalid',global:'unreadable',common:'different',currentProvider:'unknown'},providers:{total:2,matched:0,missing:0,different:1,invalid:1,unknown:0},reasonCodes:['STATUSLINE_SCRIPT_INVALID','STATUSLINE_GLOBAL_UNREADABLE','STATUSLINE_COMMON_DIFFERENT','STATUSLINE_CURRENT_PROVIDER_UNKNOWN','STATUSLINE_PROVIDER_COUNT_DIFFERENT','STATUSLINE_PROVIDER_COUNT_INVALID','STATUSLINE_PROVIDER_COUNT_MATCHED'],path:'/private/config',command:'secret command'}};
 const safe=sanitizeInventory(value);assert.deepEqual(safe.statusline.layers,value.statusline.layers);assert.equal(safe.statusline.providers.total,2);assert(!JSON.stringify(safe).includes('/private/config'));assert(!JSON.stringify(safe).includes('secret command'));
 const legacy=sanitizeInventory({...value,statusline:{configured:false,commandSHA256:null}});assert.equal(legacy.statusline.diagnosticsVersion,undefined);assert.equal(legacy.statusline.layers,undefined);
 for(const bad of [{...value,statusline:{...value.statusline,layers:{...value.statusline.layers,script:'secret'}}},{...value,statusline:{...value.statusline,providers:{...value.statusline.providers,total:4}}},{...value,statusline:{...value.statusline,reasonCodes:['STATUSLINE_COMMAND_PRIVATE']}}])assert.equal(sanitizeInventory(bad).statusline.diagnosticsVersion,undefined);
});
test('POSIX umask 0077 still creates cross-UID receipts mode 0640 with directory gid',{skip:process.platform==='win32'?'POSIX mode/setgid behavior is unavailable on Windows':false},()=>{
 const directory=mkdtempSync(join(tmpdir(),'jarvis-ai-umask-')),before=process.umask(0o077);
 try{chmodSync(directory,0o2750);const path=join(directory,'receipt.json');atomic(path,{schemaVersion:1,online:true},0o640);const st=statSync(path);assert.equal(st.mode&0o777,0o640);assert.equal(st.gid,statSync(directory).gid);assert.deepEqual(JSON.parse(readFileSync(path,'utf8')),{online:true,schemaVersion:1});}
 finally{process.umask(before);rmSync(directory,{recursive:true,force:true});}
});
