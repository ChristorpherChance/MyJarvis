/** An explicitly started conversation remains open until the user pauses or ends it. */
export function requiresWakeCheck({handsfree,conversationActive,wakeUntil,now=Date.now()}:{handsfree:boolean;conversationActive:boolean;wakeUntil:number;now?:number}){
 return handsfree&&!conversationActive&&now>wakeUntil;
}
