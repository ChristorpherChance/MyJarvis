/** Reuses the encrypted project vault; bootstrap credentials never become files or argv. */
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
import {withPlatform} from './managed-server-client.mjs';
export async function nas(script,elevated=false){
 const saved=JSON.parse(await readFile('artifacts/nas-onboarding/onboarding.json','utf8'));
 return withPlatform(async({api})=>{
  const login=await api('/api/runtime/applications/'+saved.applicationId+'/credentials/reveal',{});
  if(login.username!==saved.monitorUser)throw Error('NAS_VAULT_IDENTITY_CHANGED');
  const result=spawnSync(resolve(process.env.USERPROFILE,'.jarvis-deployment/MyJevis/cloud-tools/Scripts/python.exe'),['scripts/connect-qnap-nas.py',script,'--vault-stdin',...(elevated?['--sudo']:[])],{input:JSON.stringify({host:saved.host,sshPort:saved.sshPort,username:login.username,password:login.password}),encoding:'utf8',windowsHide:true,timeout:95000,maxBuffer:256000});
  login.password=null;
  if(result.status!==0)throw Error('NAS_FIXED_SCRIPT_FAILED');
  return result.stdout.trim();
 });
}
