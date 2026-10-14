/** Conservative endpoint classification: unknown DNS names are treated as external. */
export function isLocalEndpoint(value:unknown):boolean{
 if(typeof value!=='string')return false;try{const url=new URL(value);if(!['http:','https:'].includes(url.protocol)||url.username||url.password)return false;const host=url.hostname.replace(/^\[|\]$/g,'').toLowerCase();if(host==='localhost'||host.endsWith('.localhost')||host==='::1')return true;const ipv4=host.split('.').map(Number);if(ipv4.length===4&&ipv4.every(n=>Number.isInteger(n)&&n>=0&&n<=255))return ipv4[0]===127||ipv4[0]===10||(ipv4[0]===192&&ipv4[1]===168)||(ipv4[0]===172&&ipv4[1]>=16&&ipv4[1]<=31)||(ipv4[0]===169&&ipv4[1]===254);return /^f[cd][0-9a-f]{2}:/.test(host)||/^fe[89ab][0-9a-f]:/.test(host);}catch{return false;}
}
export function cloudGate(preferences:unknown,local:boolean,consent:boolean):'CLOUD_FORBIDDEN'|'CLOUD_CONSENT_REQUIRED'|null{
 if(local)return null;const policy=preferences&&typeof preferences==='object'?(preferences as Record<string,unknown>).cloudPrivacy:'ask';if(policy==='local')return 'CLOUD_FORBIDDEN';if(policy!=='allowed'&&!consent)return 'CLOUD_CONSENT_REQUIRED';return null;
}
