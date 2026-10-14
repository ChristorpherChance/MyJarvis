/** LAN is opt-in and its Host allowlist is explicit; this does not open a firewall. */
export function serverBinding(environment:Record<string,string|undefined>){
 const host=environment.JARVIS_HOST??'127.0.0.1',port=Number(environment.JARVIS_PORT??3140),loopback=['127.0.0.1','::1','localhost'].includes(host);
 if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('Invalid JARVIS_PORT');
 if(!loopback&&(environment.JARVIS_ALLOW_LAN!=='1'||!environment.JARVIS_ALLOWED_HOSTS?.trim()))throw new Error('LAN requires JARVIS_ALLOW_LAN=1 and explicit JARVIS_ALLOWED_HOSTS');
 const allowedHosts=(environment.JARVIS_ALLOWED_HOSTS??'localhost,127.0.0.1,[::1]').split(',').map(v=>v.trim()).filter(Boolean);
 for(const name of allowedHosts){let url:URL;try{url=new URL('http://'+name);}catch{throw new Error('Invalid JARVIS_ALLOWED_HOSTS');}if(url.hostname!==name||url.host!==name||url.username||url.password||url.pathname!=='/'||url.search||url.hash||name.includes('*')||['0.0.0.0','[::]'].includes(name))throw new Error('Allowed hosts must be exact hostnames or IPs without ports, paths, credentials or wildcard');}
 if(!allowedHosts.length)throw new Error('Empty JARVIS_ALLOWED_HOSTS');
 const tlsKey=environment.JARVIS_TLS_KEY?.trim(),tlsCert=environment.JARVIS_TLS_CERT?.trim();
 if(!!tlsKey!==!!tlsCert)throw new Error('JARVIS_TLS_KEY and JARVIS_TLS_CERT must be provided together');
 return {host,port,allowedHosts,tlsKey,tlsCert};
}
