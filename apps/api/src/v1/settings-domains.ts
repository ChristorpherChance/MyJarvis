import { BusinessError, type DomainHandler } from './types.js';
const reject=(message:string,status=400):never=>{throw new BusinessError(status===503?'NOT_CONFIGURED':status===409?'CONFLICT':'VALIDATION',message,status)};
export const settingsHandler:DomainHandler={domain:'settings',commands:['policy','terminal','model-capability','pi-provider'],execute(command,p,c){
 if(command==='pi-provider')return reject('Pi模型认证请使用已接通的原生模型配置接口 /api/settings/pi；此兼容入口不另存凭证',503);
 if(command==='policy'){
  if(c.scope!=='personal')return reject('管理员平台策略须保存在本人范围');
  const old=c.list('settings').find(s=>s.kind==='policy');if(old)c.check(old);else if(c.expectedVersion!==0)return reject('新策略版本必须为0',409);
  const body={kind:'policy',status:'configured',supervise:p.supervise??old?.supervise??false,autoWake:p.autoWake??old?.autoWake??false,emergency:p.emergency??old?.emergency??false,dailyBudget:p.dailyBudget??old?.dailyBudget??0,retryLimit:p.retryLimit??old?.retryLimit??0,notify:old?.notify??true,notifications:old?.notifications||{},quietStart:old?.quietStart||'',quietEnd:old?.quietEnd||'',enforcement:'controlled-execution-and-pi-jobs',updatedAt:c.now};
  const r=old?c.update('settings',old.id,body):c.create('settings',{...body,createdAt:c.now});c.emit('settings',r.id,'policy',{emergency:r.emergency});return r;
 }
 if(command==='terminal'){
  const old=p.terminalId?c.require('settings',p.terminalId):undefined;if(old){c.check(old);if(old.kind!=='terminal')return reject('对象不是房间终端')}else if(c.expectedVersion!==0)return reject('新终端版本必须为0',409);
  if(p.operation==='remove'){
   if(!old)return reject('终端不存在');const r=c.update('settings',old.id,{status:'disabled',enabled:false,updatedAt:c.now});c.emit('settings',r.id,'terminal-disabled');return r;
  }
  if(!c.machine(p.machineId))return reject('请选择已登记的设备');
  if(p.operation!=='configure'||typeof p.name!=='string'||!p.name.trim()||p.name.length>200)return reject('请填写终端名称并选择configure操作');
  const profileId=p.profileId||'public';if(profileId!=='public'&&profileId!=='me'&&!c.member?.(profileId))return reject('请先登记成员档案');
  const body={kind:'terminal',status:'not-connected',name:p.name,machineId:p.machineId,roomId:p.roomId||'study',profileId:p.profileId||'public',enabled:p.enabled!==false,componentConnected:false,identityBinding:'configuration-hint-only',updatedAt:c.now};
  const r=old?c.update('settings',old.id,body):c.create('settings',{...body,createdAt:c.now});c.emit('settings',r.id,'terminal-configured',{machineId:p.machineId,componentConnected:false});return r;
 }
 if(command==='model-capability'){
  if(c.expectedVersion!==0)return reject('新能力登记版本必须为0',409);
  const r=c.create('settings',{kind:'model-capability',status:'not-connected',capability:p.capability,provider:p.provider||'',model:p.model||'',runtimeConnected:false,createdAt:c.now,updatedAt:c.now});c.emit('settings',r.id,'capability-registered',{capability:p.capability,runtimeConnected:false});return r;
 }
 return reject('未知设置命令');
}};
