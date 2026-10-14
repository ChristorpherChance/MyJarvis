export async function api<T>(path:string, options?:RequestInit):Promise<T> {
  const response = await fetch('/api'+path, {credentials:'same-origin',...options,headers:{'Content-Type':'application/json',...options?.headers}});
  const body=await response.json().catch(()=>null);
  if(!response.ok) {if(response.status===401)window.dispatchEvent(new Event('jarvis:auth-required'));throw new Error(body?.error?.message || `请求失败（${response.status}）`);}
  return body as T;
}
export const post=<T>(path:string,body:unknown)=>api<T>(path,{method:'POST',body:JSON.stringify(body)});
export const patch=<T>(path:string,body:unknown)=>api<T>(path,{method:'PATCH',body:JSON.stringify(body)});
export async function streamChat(id:string,text:string,onEvent:(event:string,data:Record<string,unknown>)=>void) {
  const response=await fetch(`/api/chat/conversations/${encodeURIComponent(id)}/stream`,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({text})});
  if(!response.ok){if(response.status===401)window.dispatchEvent(new Event('jarvis:auth-required'));const body=await response.json().catch(()=>null);throw new Error(body?.error?.message||`对话请求失败（${response.status}）`)}
  if(!response.body) throw new Error('浏览器未能接收对话流');
  const reader=response.body.getReader();const decoder=new TextDecoder();let pending='';let settled=false;let doneStatus='';let reportedError=false;
  function consume() { let split:number;while((split=pending.indexOf('\n\n'))!==-1){const block=pending.slice(0,split);pending=pending.slice(split+2);let event='message';const lines:string[]=[];for(const line of block.split('\n')){if(line.startsWith('event:'))event=line.slice(6).trim();if(line.startsWith('data:'))lines.push(line.slice(5).trimStart())}if(lines.length){try{const payload=JSON.parse(lines.join('\n'));if(event==='done'){settled=true;doneStatus=String(payload.status||'complete')}if(event==='error')reportedError=true;onEvent(event,payload)}catch(error){if(error instanceof SyntaxError)continue;throw error}}} }
  try {for(;;){const {value,done}=await reader.read();if(done)break;pending=(pending+decoder.decode(value,{stream:true})).replace(/\r\n/g,'\n');consume()}pending+=decoder.decode();consume();if(!settled)throw new Error('对话连接已中断，请查看会话记录后重试。');if(doneStatus==='failed'&&!reportedError)throw new Error('回复生成失败，请查看会话记录后重试。')} finally {reader.releaseLock()}
}
