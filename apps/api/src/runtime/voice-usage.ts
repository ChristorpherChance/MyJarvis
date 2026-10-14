export interface VoiceProviderUsage {inputTokens:number;outputTokens:number;cacheReadTokens:number;cacheWriteTokens:number;totalTokens:number;costUSD:number|null;reported:boolean;}
const number=(v:unknown)=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0&&v<=1e12?v:undefined;
/** Only explicit provider usage fields or documented metering headers qualify. */
export function voiceProviderUsage(body:any,headers?:Headers):VoiceProviderUsage|undefined {
 const u=body?.usage;const header=(...names:string[])=>{for(const name of names){const raw=headers?.get(name);if(raw!==null&&raw!==undefined&&/^\d+$/.test(raw)){const n=number(Number(raw));if(n!==undefined)return n;}}return undefined;};
 const input=number(u?.input_tokens??u?.prompt_tokens)??header('x-usage-input-tokens','x-input-tokens');
 const output=number(u?.output_tokens??u?.completion_tokens)??header('x-usage-output-tokens','x-output-tokens');
 const total=number(u?.total_tokens)??header('x-usage-total-tokens','x-total-tokens');
 if(input===undefined||output===undefined)return;
 const read=number(u?.cache_read_input_tokens??u?.input_tokens_details?.cached_tokens)??header('x-usage-cache-read-tokens')??0,write=number(u?.cache_creation_input_tokens)??header('x-usage-cache-write-tokens')??0;
 const rawCost=u?.cost_usd??headers?.get('x-usage-cost-usd'),cost=rawCost!==null&&rawCost!==undefined?Number(rawCost):NaN;
 return {inputTokens:input,outputTokens:output,cacheReadTokens:read,cacheWriteTokens:write,totalTokens:total??input+output,costUSD:Number.isFinite(cost)&&cost>=0?cost:null,reported:true};
}
