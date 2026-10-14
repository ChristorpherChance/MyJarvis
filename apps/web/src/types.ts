export interface Member { id:string; name:string; role:'owner'|'adult'|'child'|'elder'; voice:string; wakeWord:string; preferences:string; createdAt:string }
export interface Device { id:string; name:string; role:string; host:string; address:string; status:'online'|'unknown'|'offline'; cpu:string; memoryGB:number; lastSeen:string|null }
export interface Project { id:string; name:string; description:string; deviceId:string; status:'planned'|'active'|'paused'|'delivered'; path:string; createdAt:string }
export interface Task { id:string; title:string; projectId:string; status:'queued'|'running'|'blocked'|'done'|'cancelled'; executor:'manual'|'pi'; notes:string; createdAt:string; updatedAt:string }
export interface Experience { id:string; title:string; content:string; tags:string[]; memberId:string; projectId:string; source:string; status:'inbox'|'verified'; createdAt:string }
export interface Health { time:string; host:{id:string;name:string;platform:string;release:string;cpuModel:string;cpuCores:number;memoryTotal:number;memoryFree:number;uptime:number}; pi:{configured:boolean;provider:string;model:string;activeRuns:number};version:string }
export interface Capability { id:string; name:string; status:'ready'|'planned'; description:string }
export interface Bootstrap { members:Member[];devices:Device[];projects:Project[];tasks:Task[];experiences:Experience[];health:Health;capabilities:Capability[] }
export interface Conversation { id:string;memberId:string;title:string;createdAt:string }
export interface ChatMessage { id:string;role:'user'|'assistant';content:string;createdAt:string;status:'complete'|'failed'|'cancelled' }
export interface PiModelSelection { provider:string; model:string }
export interface PiConversationRouting {enabled:boolean;fast:PiModelSelection|null;advanced:PiModelSelection|null;transition:boolean;transitionAfterMs:number;transitionTimeoutMs:number}
export interface PiModelPrice { input:number; output:number; cacheRead:number; cacheWrite:number }
export interface PiGateway { id:string; provider:string; name:string; baseUrl:string; api:'anthropic-messages'|'openai-completions'; credentialConfigured:boolean; modelCount:number; pricing:string }
export interface PiSettings {
 provider:string;model:string;configured:boolean;
 providers:{id:string;name:string;credentialConfigured?:boolean;models:{id:string;name:string}[]}[];
 gateway?:{provider:string;baseUrl:string;api:string;credentialConfigured:boolean;pricing:string};
 gateways?:PiGateway[];
 routing?:{revision:number;routes:Record<string,PiModelSelection>;prices:{provider:string;model:string;price:PiModelPrice}[];conversation?:PiConversationRouting;scenarios:{id:string;name:string;description:string;provider:string;model:string;inherited:boolean;configured:boolean;pricingKnown:boolean;budgetReady:boolean}[]};
}
export type Route='overview'|'devices'|'projects'|'tasks'|'experiences'|'chat'|'members'|'settings';
