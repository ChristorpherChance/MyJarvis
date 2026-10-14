/** Pinned maintenance access. Login tokens remain in memory and are revoked. */
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {request} from 'node:https';
import {randomUUID} from 'node:crypto';
import {resolve} from 'node:path';

export const lanProfile=resolve('artifacts/server-access/lenovo/ssh-config');
export const cloudProfile=resolve('artifacts/server-access/cloud-lenovo/ssh-config');
export function remote(profile,alias,script,root=false,{timeoutMs=45000}={}){
 if(!Number.isSafeInteger(timeoutMs)||timeoutMs<1000||timeoutMs>180000)throw Error('SSH_TIMEOUT_INVALID');
 const result=spawnSync('ssh',['-F',profile,'-o','BatchMode=yes',alias,root?'sudo -n python3 -':'python3 -'],{input:script,encoding:'utf8',windowsHide:true,timeout:timeoutMs,maxBuffer:2000000});
 if(result.status!==0)throw Error('SSH_OPERATION_FAILED '+alias+' '+result.stderr.slice(-1000));
 return result.stdout.trim();
}
export function python(payload,script){return "import json,base64\np=json.loads(base64.b64decode('"+Buffer.from(JSON.stringify(payload)).toString('base64')+"'))\n"+script;}
export const primary=script=>remote(lanProfile,'jarvis-112',script,true);
/** Remove only this verification run's local voice allowance charges, with a private reversible ledger. */
export function clearSyntheticVoiceMeter(sessionIds,notBefore,notAfter=Date.now()){
 const ids=[...new Set(sessionIds)];if(!ids.length)return {sessions:0,jobs:0,seconds:0};
 if(ids.length>50||ids.some(id=>!/^[0-9a-f-]{36}$/i.test(id))||!Number.isFinite(notBefore)||!Number.isFinite(notAfter)||notAfter<notBefore)throw Error('INVALID_TEST_VOICE_SCOPE');
 return JSON.parse(primary(python({ids,notBefore,notAfter},`import sqlite3,json,os,uuid,datetime
from pathlib import Path
c=sqlite3.connect('/var/lib/jarvis/data/jarvis.db',timeout=10);c.row_factory=sqlite3.Row
c.execute('BEGIN IMMEDIATE')
try:
 rows=[]
 for sid in p['ids']:
  s=c.execute('SELECT actor_id,created_at FROM runtime_voice_sessions WHERE id=?',(sid,)).fetchone()
  if s is None or s['actor_id']!='server-admin':raise RuntimeError('TEST_VOICE_SESSION_OWNER_MISMATCH')
  created=datetime.datetime.fromisoformat(s['created_at'].replace('Z','+00:00')).timestamp()*1000
  if not p['notBefore']<=created<=p['notAfter']:raise RuntimeError('TEST_VOICE_SESSION_TIME_MISMATCH')
  if c.execute("SELECT 1 FROM runtime_voice_jobs WHERE session_id=? AND status IN('queued','running')",(sid,)).fetchone():raise RuntimeError('TEST_VOICE_SESSION_STILL_RUNNING')
  rows.extend(dict(r) for r in c.execute('SELECT u.* FROM runtime_voice_usage u JOIN runtime_voice_jobs j ON j.id=u.job_id WHERE j.session_id=? AND u.actor_id=?',(sid,'server-admin')))
 if rows:
  folder=Path('/var/lib/jarvis-control/test-voice-meter');folder.mkdir(mode=0o700,parents=True,exist_ok=True)
  target=folder/(str(uuid.uuid4())+'.json')
  fd=os.open(target,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
  with os.fdopen(fd,'w') as f:json.dump({'reason':'Explicit synthetic verification sessions; genuine usage and preferences unchanged','sessionIds':p['ids'],'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'rows':rows},f)
  for r in rows:c.execute('DELETE FROM runtime_voice_usage WHERE job_id=? AND actor_id=?',(r['job_id'],'server-admin'))
 c.commit()
 print(json.dumps({'sessions':len(p['ids']),'jobs':len(rows),'seconds':round(sum(r['seconds'] for r in rows),3)}))
except:
 c.rollback();raise
finally:c.close()
`)));
}
function storeCode(code){return python({code},`import subprocess
r=subprocess.run(['/opt/jarvis/node/bin/node','--input-type=module','-e',p['code']],cwd='/opt/jarvis/current',capture_output=True,text=True,check=True)
print(r.stdout)
`);}
export async function withPlatform(action,{syntheticVoice=false}={}){
 const testStarted=Date.now()-5000,testSessions=[];
 const ca=await readFile('artifacts/linux-deployment/jarvis-lan-ca.crt');
 const cookie=primary(storeCode("import {Store} from './apps/api/dist/store.js';const s=new Store('/var/lib/jarvis/data');try{process.stdout.write(s.createLogin());}finally{s.close();}"));
 if(!/^[A-Za-z0-9_-]{43}$/.test(cookie))throw Error('MAINTENANCE_SESSION_INVALID');
 const api=(path,body,method=body===undefined?'GET':'POST',options={})=>new Promise((res,rej)=>{
  const raw=body===undefined?null:Buffer.isBuffer(body)?body:JSON.stringify(body);
  const timeoutMs=options.timeoutMs??(path==='/api/settings/pi/test'?150000:20000);
  if(!Number.isSafeInteger(timeoutMs)||timeoutMs<1000||timeoutMs>150000)return rej(Error('INVALID_API_TIMEOUT'));
  const req=request('https://192.168.10.112:3140'+path,{method,ca,headers:{...options.headers,cookie:'jarvis_session='+cookie,...(raw?{'content-type':options.contentType??'application/json','content-length':Buffer.byteLength(raw)}:{})},timeout:timeoutMs},r=>{
   const chunks=[];let bytes=0;r.on('data',b=>{bytes+=b.length;if(bytes>10*1024*1024){req.destroy(Error('API_RESPONSE_TOO_LARGE'));return;}chunks.push(Buffer.from(b));});r.on('end',()=>{const rawBody=Buffer.concat(chunks);if(options.binary&&r.statusCode>=200&&r.statusCode<300){res(rawBody);return;}const text=rawBody.toString('utf8');let data;try{data=JSON.parse(text);}catch{return rej(Error('INVALID_API_RESPONSE'));}if(r.statusCode<200||r.statusCode>=300)return rej(Error('API_'+r.statusCode+' '+JSON.stringify(data).slice(0,1500)));if(syntheticVoice&&method==='POST'&&path==='/api/runtime/voice/sessions')testSessions.push(data.id);res(data);});
  });req.once('error',rej);req.once('timeout',()=>req.destroy(Error('API_TIMEOUT')));req.end(raw);
 });
 const records=async domain=>{const result=[];let cursor;do{const r=await api('/api/v1/'+domain+'?limit=100'+(cursor?'&cursor='+encodeURIComponent(cursor):''));result.push(...r.data.items);cursor=r.data.nextCursor;}while(cursor);return result;};
 const command=async(domain,name,payload,revision=0)=>(await api('/api/v1/'+domain+'/commands/'+name,{commandId:randomUUID(),scope:'personal',expectedVersion:revision,payload})).data;
 try{return await action({api,records,command});}
 finally{try{if(syntheticVoice){for(const id of testSessions)await api('/api/runtime/voice/sessions/'+id,undefined,'DELETE');clearSyntheticVoiceMeter(testSessions,testStarted);}}finally{primary(storeCode("import {Store} from './apps/api/dist/store.js';const s=new Store('/var/lib/jarvis/data');try{s.deleteLogin("+JSON.stringify(cookie)+");}finally{s.close();}"));}}
}
