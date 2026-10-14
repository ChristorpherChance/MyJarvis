import {writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {withPlatform} from './managed-server-client.mjs';
const result=await withPlatform(async({api})=>{
 const health=await api('/api/health');
 const config=(await api('/api/v1/execution/config')).data;
 const supervision=(await api('/api/v1/execution/supervision')).data;
 const templates=config.templates.filter(t=>t.id.startsWith('msf-autonomy-'));
 if(health.build!=='20261011-project-autonomy-r22-2'||templates.length!==18||supervision.supervised!==false)throw Error('RECORD_ONLY_LIVE_BINDING_CHANGED');
 for(const t of templates)if(t.supervision?.billing!=='record-only'||t.args.some(a=>a==='--max-budget-usd'||a.startsWith('--max-budget-usd=')))throw Error('RECORD_ONLY_HIDDEN_FEE_CAP');
 const guide=await api('/api/v1/project-autonomy/guide',undefined,'GET',{binary:true});
 if(!guide.toString('utf8').includes('只记录'))throw Error('RECORD_ONLY_GUIDE_NOT_PUBLISHED');
 return {at:new Date().toISOString(),release:health.build,health,executors:templates.length,billing:'record-only',nativeUSDCap:false,globalSupervision:false,guide:{bytes:guide.length,sha256:createHash('sha256').update(guide).digest('hex')},modelCalls:0,productAccepted:false};
});
await writeFile('artifacts/software-factory/autonomy-r22/record-only-live-verification.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result));
