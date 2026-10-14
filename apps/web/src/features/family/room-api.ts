/** Renew only a deleted conversation rejected before Pi ran. Unknown outcomes are never retried. */
export async function sendRoomMessageContinuing<T>(options:{conversationId:string;text:string;cloudConsent:boolean;voiceMode?:boolean;voiceLanguage?:'zh'|'en'|'fr'|'de';request:(path:string,body:unknown,signal?:AbortSignal)=>Promise<T>;renew:()=>Promise<string>;signal:AbortSignal}):Promise<T>{
 const send=(id:string)=>options.request(`/api/runtime/family/conversations/${encodeURIComponent(id)}/messages`,{text:options.text,cloudConsent:options.cloudConsent,...options.voiceMode?{voiceMode:true,...options.voiceLanguage?{voiceLanguage:options.voiceLanguage}:{}}:{}},options.signal);
 try{return await send(options.conversationId);}catch(error){if(options.signal.aborted||(error as any).status!==404||(error as any).code!=='NOT_FOUND')throw error;const id=await options.renew();options.signal.throwIfAborted();return send(id);}
}
