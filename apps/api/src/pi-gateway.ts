import { z } from 'zod';
import { presetGateways, type GatewayDefinition } from './pi-routing.js';

export const gatewayProvider = 'superopen';
export const gatewayUrl = 'https://gw.superopen.top';
export const gatewayApi = 'anthropic-messages' as const;
export class GatewayError extends Error { constructor(readonly code:string) { super(code); } }
// Router model IDs are JSON values, never paths or commands. This gateway's
// CLIProxyAPI catalog adds a display namespace rejected by /v1/messages;
// preserve CPA routing while removing only that verified display namespace.
const modelId=z.string().trim().min(1).max(200).regex(/^[A-Za-z0-9][^\u0000-\u001f\u007f]*$/);
export function gatewayRequestModelId(catalogId:string){return catalogId.replace(/^CPA\s*\/\s*CLIProxyAPI\//,'CPA / ');}
/** This gateway advertises /v1/messages. Credentials never leave this fixed HTTPS origin. */
export async function discoverGateway(key:string,request:typeof fetch=fetch,definition:GatewayDefinition=presetGateways[0]!) {
  if(!key.trim() || key.length>8192 || /[\r\n]/.test(key))throw new GatewayError('PI_GATEWAY_KEY_REQUIRED');
  try {
    const endpoint=definition.baseUrl.replace(/\/+$/,'')+(/\/v1$/.test(definition.baseUrl)?'/models':'/v1/models');
    const response=await request(endpoint,{headers:{authorization:'Bearer '+key,...(definition.api==='anthropic-messages'?{'x-api-key':key,'anthropic-version':'2023-06-01'}:{})},redirect:'error',signal:AbortSignal.timeout(15000)});
    if([401,403].includes(response.status))throw new GatewayError('PI_GATEWAY_AUTH_FAILED');
    if(!response.ok)throw new GatewayError('PI_GATEWAY_UNAVAILABLE');
    // Bound catalog size; never expose an upstream response or echoed credential.
    const reader=response.body?.getReader();if(!reader)throw new GatewayError('PI_GATEWAY_CATALOG_INVALID');
    const chunks:Uint8Array[]=[];let size=0;
    while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>512*1024){await reader.cancel();throw new GatewayError('PI_GATEWAY_CATALOG_INVALID');}chunks.push(part.value);}
    const body=JSON.parse(Buffer.concat(chunks).toString('utf8'));
    const entries=Array.isArray(body)?body:body.data??body.models;
    if(!Array.isArray(entries)||entries.length>1000)throw new GatewayError('PI_GATEWAY_CATALOG_INVALID');
    const models=new Map<string,{id:string;name:string}>();
    for(const entry of entries){const candidate=typeof entry==='string'?entry:entry?.id??entry?.name;const parsed=modelId.safeParse(candidate);if(parsed.success){const fullName=String(entry?.display_name??entry?.name??parsed.data),id=definition.id===gatewayProvider?gatewayRequestModelId(parsed.data):parsed.data;if(!parsed.data.includes(key)&&!id.includes(key)&&!fullName.includes(key))models.set(id,{id,name:fullName.slice(0,200)});}}
    if(!models.size)throw new GatewayError('PI_GATEWAY_CATALOG_INVALID');
    return {provider:definition.id,baseUrl:definition.baseUrl,api:definition.api,models:[...models.values()],discoveredAt:new Date().toISOString(),pricing:'unavailable' as const};
  }catch(error){if(error instanceof GatewayError)throw error;throw new GatewayError('PI_GATEWAY_UNAVAILABLE');}
}
