import {defineTool,type ToolDefinition} from '@earendil-works/pi-coding-agent';
import {Type} from 'typebox';
import type {NotificationRuntime} from './notifications.js';
import type {RuntimePrincipal} from './identity.js';
/** Only the authenticated caller's current notification data can enter a conversation. */
export function createNotificationTools(runtime:NotificationRuntime,principal:RuntimePrincipal):ToolDefinition[]{return [defineTool({name:'jarvis_notifications',label:'本人提醒',description:'查询当前已认证本人可见的真实事项提醒与到期内容。来源已结束的通知不当作待办；只查询，不标记、确认或修改提醒。',annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false},parameters:Type.Object({limit:Type.Optional(Type.Integer({minimum:1,maximum:30}))},{additionalProperties:false}),execute:async(_id,input,signal)=>{signal?.throwIfAborted();const snapshot=runtime.list(principal,{limit:input.limit??20});return {content:[{type:'text',text:JSON.stringify({unread:snapshot.unread,items:snapshot.items})}],details:{readOnly:true,identity:'current-member'}};}})];}
