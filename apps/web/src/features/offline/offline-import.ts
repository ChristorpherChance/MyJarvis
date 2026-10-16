import {V1Error} from '../../v1-client';
import {createInboxDraft,getInboxDraft,saveInboxDraft,type InboxDraft} from '../operations/inbox-draft';
import {materialSessionGeneration,removeInboxMaterialDraft,saveInboxMaterialDraft,type LocalInboxMaterial} from '../operations/inbox-material-store';
import {validateOfflineVaultDraft,type OfflineVaultDraft} from './offline-vault';

/** This explicit copy enters the existing authenticated browser draft. It never uploads or submits. */
export async function importOfflineInboxDraft(actorId:string,input:OfflineVaultDraft,stillCurrent:()=>boolean):Promise<InboxDraft>{
 const epoch=materialSessionGeneration();
 const check=()=>{if(!stillCurrent()||materialSessionGeneration()!==epoch)throw new DOMException('Aborted','AbortError')};
 const empty=()=>{check();if(getInboxDraft(actorId))throw new Error('此浏览器已有草稿，请先保存或明确清除，再导入离线记录。')};
 empty();const value=validateOfflineVaultDraft(input);
 const response=await fetch('/api/runtime/identity/state',{credentials:'same-origin',cache:'no-store'});check();
 const identity=await response.json().catch(()=>null);check();
 if(!response.ok||!identity?.authenticated||identity.administrator!==true||actorId!=='server-admin')throw new V1Error('请以当前管理员身份重新验证后导入；成员或终端身份不能代替。',401,'ADMIN_REQUIRED');
 empty();
 const draft=createInboxDraft({rawText:value.rawText,title:value.title,kind:value.kind,scope:value.scope,sourceUrl:value.sourceUrl,terminalId:'离线密文草稿导入',projectId:'',materialRevision:value.materials.length?1:0});
 const materials:LocalInboxMaterial[]=value.materials.map(item=>({id:crypto.randomUUID(),filename:item.filename,mime:item.mime,size:item.blob.size,scope:value.scope,blob:item.blob}));
 let stored=false;
 try{
  await saveInboxMaterialDraft(actorId,draft.id,materials,epoch);stored=true;empty();
  // saveInboxDraft performs a second synchronous compare before replacing any local text.
  return saveInboxDraft(actorId,draft);
 }catch(error){
  // Remove only this newly generated row, while the initiating identity is still current.
  if(stored&&stillCurrent()&&materialSessionGeneration()===epoch){try{if(getInboxDraft(actorId)?.id!==draft.id)await removeInboxMaterialDraft(actorId,draft.id)}catch{/* The encrypted source package remains available to recover. */}}
  throw error;
 }
}
