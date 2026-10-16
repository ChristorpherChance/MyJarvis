import {V1Error,v1Command,type V1Record} from '../../v1-client';
import {readInboxMaterial,reuseMaterialBook} from './inbox-material-client';
import {getMaterialIntent,removeMaterialIntent,saveMaterialIntent,type BookRegistrationIntent} from './inbox-material-intents';
import {materialSessionGeneration} from './inbox-material-store';

export const bookRegistrationName=(id:string)=>'register-book:'+id;
export const reusableBookMime=(mime:string)=>['application/pdf','image/png','image/jpeg','image/webp'].includes(mime);
export function pendingBookRegistration(actorId:string,id:string):BookRegistrationIntent|null {
  const intent=getMaterialIntent(actorId,bookRegistrationName(id));
  return intent?.kind==='register-book'?intent:null;
}
/** All three commands are persisted together before the first request. A missing receipt replays those exact commands. */
export async function registerStoredMaterialBook(actorId:string,assetId:string,values:Record<string,unknown>,sources:V1Record[]):Promise<unknown> {
  const session=materialSessionGeneration(),current=()=>session===materialSessionGeneration();
  const check=()=>{if(!current())throw new Error('身份已变化，请重新验证后查看原件。')};
  const name=bookRegistrationName(assetId);
  let intent=pendingBookRegistration(actorId,assetId);
  if(!intent){
    const asset=await readInboxMaterial(assetId);check();
    if(asset.status!=='stored'||(asset.lifecycle??'active')!=='active'||!reusableBookMime(asset.mime))throw new V1Error('请使用仍在原件库中的 PDF 或扫描图片；其他材料继续保留为资料候选。',409,'MATERIAL_UNAVAILABLE');
    const source=sources.find(item=>item.id===values.source&&item.kind==='source'&&item.active===true&&item.authorized===true&&item.mode!=='live'&&item.scope===asset.scope);
    if(!source)throw new V1Error('请选择与原件范围一致、仍有效授权的知识来源。',403,'SOURCE_UNAVAILABLE');
    if(asset.mime!=='application/pdf'&&Number(values.pages)!==1)throw new V1Error('单张扫描图片只能登记一页。',400,'VALIDATION');
    intent={kind:'register-book',assetId,input:{assetRevision:asset.revision!,prepareCommandId:crypto.randomUUID(),reuseCommandId:crypto.randomUUID(),createCommandId:crypto.randomUUID(),sourceId:source.id,filename:asset.filename,mime:asset.mime,size:asset.size,scope:source.scope,title:String(values.title??'').trim(),edition:String(values.edition??'').trim(),author:String(values.author??'').trim(),pages:Number(values.pages),rights:String(values.rights??'').trim(),layout:String(values.layout??''),...(values.materialId?{materialId:String(values.materialId)}:{})}};
    saveMaterialIntent(actorId,name,intent);
  }
  const input=intent.input;check();
  try{
  const ticket=await v1Command('books','create-upload',{sourceId:input.sourceId,filename:input.filename,mime:input.mime,size:input.size},input.scope,0,input.prepareCommandId);check();
  const asset=await reuseMaterialBook(assetId,{commandId:input.reuseCommandId,expectedVersion:input.assetRevision,uploadId:ticket.data.id});check();
  if(asset.lastReuse?.commandId!==input.reuseCommandId||asset.lastReuse.bookUpload?.id!==ticket.data.id||asset.lastReuse.status!=='complete'||asset.lastReuse.bookUpload.status!=='stored'){
    if(asset.lastReuse?.commandId===input.reuseCommandId&&asset.lastReuse.status==='failed'){
      removeMaterialIntent(actorId,name,intent);
      throw new Error(asset.lastReuse.error?.message||'这次登记未完成，原件仍保留。核对原因后可重新登记。');
    }
    throw new Error('原件登记结果尚未确认，请确认上次登记，不要另建一份。');
  }
  const result=await v1Command('books','create',{uploadId:ticket.data.id,title:input.title,edition:input.edition,author:input.author,pages:input.pages,rights:input.rights,layout:input.layout,...(input.materialId?{materialId:input.materialId}:{})},input.scope,0,input.createCommandId);check();
  removeMaterialIntent(actorId,name,intent);return result;
  }catch(error){
    if(current()&&error instanceof V1Error&&[400,403,404,409,422].includes(error.status)){
      // A definite rejection permits a new explicit attempt only after reading current source state.
      await readInboxMaterial(assetId);check();removeMaterialIntent(actorId,name,intent);
      throw new Error(error.message+' 已重新读取原件状态，请核对原件、来源和书目信息后再明确登记。');
    }
    throw error;
  }
}
