import {readFile} from 'node:fs/promises';
import {resolve,relative,isAbsolute} from 'node:path';

export function validatePlan(plan){
 const require=(ok,message)=>{if(!ok)throw Error('MANAGED_PLAN_INVALID '+message);};
 require(plan?.version===1&&Array.isArray(plan.servers)&&plan.servers.length>0&&plan.servers.length<=100,'servers');
 require(new Set(plan.servers.map(s=>s.id)).size===plan.servers.length,'duplicate server');
 for(const s of plan.servers){
  require(typeof s.id==='string'&&/^[a-z0-9-]{1,40}$/.test(s.id),'id');
  require(typeof s.host==='string'&&/^[A-Za-z0-9.:-]{1,253}$/.test(s.host),'host');
  require(Number.isInteger(s.port)&&s.port>=1&&s.port<=65535,'port');
  require(typeof s.user==='string'&&/^[a-z_][a-z0-9_-]{0,60}$/.test(s.user),'user');
  require(typeof s.hostname==='string'&&s.hostname.length>0,'hostname');
  require(typeof s.fingerprint==='string'&&/^SHA256:[A-Za-z0-9+/]{43}$/.test(s.fingerprint),'fingerprint');
  require(typeof s.profile==='string','profile');
  const path=relative(resolve('artifacts/server-access'),resolve(s.profile));
  require(!path.startsWith('..')&&!isAbsolute(path),'pinned profile must be a connection bundle');
  for(const key of ['name','role','room'])require(typeof s[key]==='string'&&s[key].length>0&&s[key].length<=300,key);
  require(Array.isArray(s.services)&&s.services.length>0&&s.services.length<=32,'service bound');
  require(new Set(s.services.map(v=>v.unit)).size===s.services.length,'duplicate unit');
  for(const service of s.services){
   require(typeof service.unit==='string'&&/^[A-Za-z0-9_.@-]{1,180}\.service$/.test(service.unit),'fixed systemd unit');
   require(['running','active','stopped'].includes(service.expected),'expected state');
   require(['production','test','staging'].includes(service.environment),'environment');
   require(typeof service.name==='string'&&service.name.length>0&&service.name.length<300,'service name');
  }
 }
 return plan;
}
export async function loadPlan(path='config/servers.managed.json'){return validatePlan(JSON.parse(await readFile(path,'utf8')));}
export function verifyInspection(server,hardware){
 if(hardware.hostname!==server.hostname||!String(hardware.hostKey).split(/\s+/).includes(server.fingerprint))throw Error('MANAGED_HOST_IDENTITY_MISMATCH '+server.id);
 if(!hardware.python||!hardware.openssl||!Number.isFinite(hardware.ramGB)||!Number.isFinite(hardware.diskGB))throw Error('MANAGED_HOST_PREREQUISITES_MISSING '+server.id);
 const loaded=new Set(hardware.services.map(s=>s.Id));
 for(const service of server.services)if(!loaded.has(service.unit))throw Error('MANAGED_SERVICE_NOT_LOADED '+server.id+' '+service.unit);
 return hardware;
}
