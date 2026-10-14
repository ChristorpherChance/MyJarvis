import {defineTool,type ToolDefinition} from '@earendil-works/pi-coding-agent';
import {Type} from 'typebox';
import {RuntimeAccessError,type IdentityRuntime,type RuntimePrincipal} from './identity.js';
import type {BillingRuntime} from './billing.js';
export function createBillingTools(billing:BillingRuntime,identity:IdentityRuntime,p:RuntimePrincipal):ToolDefinition[]{return [defineTool({name:'jarvis_billing_summary',label:'账单核对概况',description:'只读查看已导入账单的独立币种金额、已关联与待核对行数；不付款、不改预算或账单，不认证供应商账单真实性。',parameters:Type.Object({},{additionalProperties:false}),annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false},execute:async(_id,_input,signal)=>{signal?.throwIfAborted();if(!identity.isPrincipalCurrent(p)||!p.administrator||p.profileId!=='me')throw new RuntimeAccessError('FORBIDDEN','账单仅管理者本人可查询',403);return {content:[{type:'text',text:JSON.stringify(billing.summary())}],details:{readOnly:true,source:'imported-bill-evidence'}};}})];}
