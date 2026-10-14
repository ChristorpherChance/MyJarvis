export interface RoomNotificationDelivery {id:string;notificationId:string;state:string;leaseExpiresAt:string;origin:string;physicalSpeakerVerified:false;jobId?:string}
export interface RoomNotificationClient {
 sessionId:string;signal:AbortSignal;
 request:(path:string,body:unknown,headers:Record<string,string>,signal:AbortSignal)=>Promise<any>;
 download:(path:string,headers:Record<string,string>,signal:AbortSignal)=>Promise<Blob>;
 play:(blob:Blob,onState:(state:'started'|'ended'|'interrupted'|'blocked')=>Promise<void>,signal:AbortSignal)=>Promise<void>;
}
/** The caller supplies its authenticated room transport and actual Audio event callbacks. */
export async function playRoomNotification(client:RoomNotificationClient):Promise<{delivery:RoomNotificationDelivery|null;skipped?:string}>{
 client.signal.throwIfAborted();let response:any;try{response=await client.request('/api/runtime/notifications/room/claim',{sessionId:client.sessionId,requestId:crypto.randomUUID()},{},client.signal)}catch(error){if(['OPT_IN_REQUIRED','QUIET_HOURS','VOICE_BUSY','DELIVERY_BUSY','PREFERENCE_CHANGED','TTS_NOT_CONFIGURED'].includes((error as any).code))return {delivery:null,skipped:(error as any).code};throw error;}
 if(!response.delivery||!response.leaseToken||!response.audioUrl)return {delivery:null};const delivery=response.delivery as RoomNotificationDelivery,headers={'x-jarvis-notification-lease':String(response.leaseToken)},receiptPath=`/api/runtime/notifications/deliveries/${encodeURIComponent(delivery.id)}/receipt`;let terminalState=false;
 const report=async(state:'started'|'ended'|'interrupted'|'blocked')=>{if(terminalState)return;await client.request(receiptPath,{state},headers,client.signal);if(state!=='started')terminalState=true;};
 try{const blob=await client.download(String(response.audioUrl),headers,client.signal);client.signal.throwIfAborted();await client.play(blob,report,client.signal);return {delivery};}catch(error){if(!terminalState&&!client.signal.aborted)await report('blocked').catch(()=>{});throw error;}
}
