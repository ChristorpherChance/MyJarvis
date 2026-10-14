/** Text-only references. Never interpret HTML, execute schemes or automatically fetch links. */
export function answerLinks(text:string):{title:string;url:string}[]{
 const links:{title:string;url:string}[]=[];const seen=new Set<string>();
 const add=(raw:string,title?:string)=>{try{const url=new URL(raw.replace(/[。！？，、；：.!?,;]+$/g,''));if(!['http:','https:'].includes(url.protocol)||url.username||url.password)return;const value=url.href;if(seen.has(value)||links.length>=8)return;seen.add(value);links.push({title:title?.trim().slice(0,120)||url.hostname,url:value});}catch{}};
 const remainder=text.replace(/\[([^\]\n]{1,120})\]\((https?:\/\/[^\s)]+)\)/gi,(_all,title,url)=>{add(url,title);return '';});
 for(const match of remainder.matchAll(/https?:\/\/[^\s<>\[\]()"']+/gi))add(match[0]);
 return links;
}
