/** A claim starts spending its lease at request start, never at response arrival. */
export function heartbeatLeaseDeadline(leaseExpiresAt:string,leaseSec:number,requestWall:number,requestMonotonic:number):number {
 const expires=Date.parse(leaseExpiresAt);
 if(!Number.isFinite(expires)||!Number.isFinite(requestWall)||!Number.isFinite(requestMonotonic)||!Number.isFinite(leaseSec)||leaseSec<=0)return requestMonotonic;
 return requestMonotonic+Math.max(0,Math.min(expires-requestWall,leaseSec*1000));
}

/** Central timestamps supply duration; anchoring at request start deducts the full RTT. */
export function heartbeatRenewalDeadline(leaseExpiresAt:string,serverAt:string,leaseSec:number,requestMonotonic:number,replyMonotonic:number):number {
 const expires=Date.parse(leaseExpiresAt),issued=Date.parse(serverAt);
 if(!Number.isFinite(expires)||!Number.isFinite(issued)||!Number.isFinite(requestMonotonic)||!Number.isFinite(replyMonotonic)||replyMonotonic<requestMonotonic||!Number.isFinite(leaseSec)||leaseSec<=0)return requestMonotonic;
 return requestMonotonic+Math.max(0,Math.min(expires-issued,leaseSec*1000));
}

/** Only known HTTP service failures and network/timeout errors are temporary. */
export function heartbeatFailureCategory(error:unknown):'temporary'|'denied'|'permanent' {
 if(!(error instanceof Error))return 'permanent';
 if(/^AGENT_HTTP_(401|403|404|409|422)$/.test(error.message))return 'denied';
 if(/^AGENT_HTTP_5\d\d$/.test(error.message))return 'temporary';
 const code=(error as Error&{code?:string;cause?:{code?:string}}).cause?.code??(error as Error&{code?:string}).code;
 if(['ECONNREFUSED','ECONNRESET','ETIMEDOUT','EHOSTUNREACH','ENETUNREACH','EPIPE','EAI_AGAIN','UND_ERR_CONNECT_TIMEOUT','UND_ERR_HEADERS_TIMEOUT','UND_ERR_SOCKET'].includes(String(code)))return 'temporary';
 // A specific TLS/authentication/other cause must not fall through to bare fetch-failed retry.
 if(code!==undefined||error.cause!==undefined)return 'permanent';
 if(error.name==='TimeoutError'||error.name==='AbortError')return 'temporary';
 if(error instanceof TypeError&&error.message==='fetch failed')return 'temporary';
 return 'permanent';
}

/** Up to six retries and never beyond the currently signed lease window. */
export function heartbeatRetryDelay(error:unknown,retries:number,remainingMs:number):number|undefined {
 if(heartbeatFailureCategory(error)!=='temporary'||!Number.isInteger(retries)||retries<0||retries>=6||!Number.isFinite(remainingMs)||remainingMs<=0)return undefined;
 const delay=Math.min(2000,500*2**retries);
 return delay<remainingMs?delay:undefined;
}
