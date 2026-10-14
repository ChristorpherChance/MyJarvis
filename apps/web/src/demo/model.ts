import seed from './v15-seed.json';
import type {DemoAction,DemoData,DemoRecord} from './types';
import {knowledgeAction} from './knowledge-model';
import {operationsAction} from './operations-model';
import {familyAction} from './family-model';
export const stamp=()=>new Date().toLocaleString('zh-CN',{hour12:false});
export const uid=(prefix:string)=>`${prefix}-${crypto.randomUUID()}`;
export function requireThat(value:unknown,message:string):asserts value {if(!value)throw new Error(message)}
export function find(list:DemoRecord[],id:any,label='记录'):DemoRecord {const item=list.find(x=>x.id===id);requireThat(item,`${label}不存在`);return item}
export function textRequired(value:any,label:string){const s=String(value??'').trim();requireThat(s,`请填写${label}`);return s}
export function personal(d:DemoData,p:any){requireThat(p===d.profile,'请先切换到该成员的独立空间');return p}
export function admin(d:DemoData){requireThat(d.profile==='me','此操作需要管理员身份')}
export function visible(d:DemoData,item:any){return item.scope==='private'?item.owner===d.profile:d.profile==='me'||item.owner===d.profile||item.scope==='family'}
export function audit(d:DemoData,action:string,scope:string,result='已完成'){d.audit.unshift({id:uid('audit'),time:stamp(),actor:d.profile,action,scope,result});d.audit=d.audit.slice(0,300)}
export function freshDemo():DemoData {
 const d=structuredClone(seed.state) as unknown as DemoData;
 d.schema=1502;d.profile='me';d.theme='stark';d.profiles=structuredClone(seed.profiles) as any;
 d.profiles.push({id:'public',name:'公共',caption:'家庭公共空间',avatar:'家',admin:false});
 d.experiences=d.knowledge as any;d.knowledge=d.v5.knowledgeCenter;delete d.memories;
 d.backups=[];d.chat.public=[];d.learning.public={minutes:0,completed:0,days:0};
 d.preferences.public={...d.preferences.me,address:'家人',wakeword:'贾维斯',privacy:'explicit'};
 d.v5.vm.memories.public=[];d.v5.vm.policies.public={text:'30',audio:'never',longterm:'explicit'};
 // The historical prototype's IDs remain stable; its hardware allocation follows the accepted deployment plan.
 const lenovo=d.machines.find(x=>/联想|lenovo/i.test(x.name));if(lenovo)lenovo.role='主开发与测试';
 for(const m of d.machines){if(m.ram===48)m.role='生产服务';if(m.ram===32)m.role='预发布与恢复验证';if(m.kind==='small')m.role='房间语音入口 / 备用节点'}
 d.settings.terminals=[{id:'room-living',name:'一楼客厅',machine:'i3-01',role:'聊天入口',profile:'public',enabled:true},{id:'room-study',name:'二楼书房',machine:'i3-02',role:'聊天入口',profile:'public',enabled:true},{id:'room-kitchen',name:'厨房餐厅',machine:'i3-03',role:'聊天入口',profile:'public',enabled:true}];d.settings.simulated=true;return d;
}
export function reduceDemo(previous:DemoData,action:DemoAction):DemoData {
 const d=structuredClone(previous);d.knowledge=d.v5.knowledgeCenter=d.knowledge;delete d.memories;d.lastNotice='';
 const p:any=action.payload??{};let handled=true;
 if(action.type==='profile.select'){requireThat(d.profiles.some(x=>x.id===p.id),'成员不存在');if(d.profile!==p.id){for(const plan of d.v5.vm.pendingCommands??[])if((plan.profile??plan.owner)===d.profile&&plan.status==='pending'){plan.status='cancelled';plan.reason='档案切换'}d.v5.vm.nowPlaying=null}d.profile=p.id}
 else if(action.type==='theme.select'){requireThat(seed.visuals.includes(p.id),'主题不存在');d.theme=p.id}
 else if(action.type==='settings.save'){admin(d);if(p.dailyBudget!==undefined)requireThat(Number.isFinite(p.dailyBudget)&&p.dailyBudget>0,'每日预算必须大于零');if(p.retryLimit!==undefined)requireThat(Number.isInteger(p.retryLimit)&&p.retryLimit>=0&&p.retryLimit<=10,'重试上限必须为 0–10');operationsAction(d,'op.policy',{patch:p});d.settings={...d.settings,...p};d.lastNotice='设置已保存'}
 else if(action.type==='audit.clear'){admin(d);d.audit=[]}
 else if(action.type.startsWith('knowledge.'))knowledgeAction(d,action.type,p);
 else if(action.type.startsWith('op.'))operationsAction(d,action.type,p);
 else if(/^(family|chat|memory|persona)\./.test(action.type))familyAction(d,action.type,p);
 else handled=false;
 requireThat(handled,`尚未定义此操作：${action.type}`);
 if(action.type!=='profile.select'&&action.type!=='theme.select')audit(d,action.type+(p.command?'.'+p.command:''),p.id??p.bookId??p.profile??'平台');
 d.v5.knowledgeCenter=d.knowledge;return d;
}
export function snapshotForProfile(previous:DemoData){
 const d=structuredClone(previous),id=d.profile;const own=(n:any)=>(n.owner??n.profile)===id;
 d.chat=Object.fromEntries(Object.entries(d.chat).filter(([p])=>p===id||p==='public'));
 d.learning=Object.fromEntries(Object.entries(d.learning).filter(([p])=>p===id||p==='public'));
 const vm=d.v5.vm;
 vm.memories=Object.fromEntries(Object.entries(vm.memories).filter(([p])=>p===id));
 vm.privateNotes=vm.privateNotes.filter(own);vm.pendingCommands=vm.pendingCommands.filter(own);
 vm.inbox=vm.inbox.filter((n:any)=>n.scope==='family'||own(n));
 d.experiences=d.experiences.filter(n=>visible(d,n));
 d.v5.research.inbox=d.v5.research.inbox.filter((n:any)=>visible(d,n));
 d.v5.research.items=d.v5.research.items.filter((n:any)=>visible(d,n));
 for(const field of ['favorites','progress','courses'])d.knowledge[field]=Object.fromEntries(Object.entries(d.knowledge[field]).filter(([p])=>p===id));
 d.knowledge.books=d.knowledge.books.filter((b:any)=>b.scope!=='private'||own(b));
 d.knowledge.stories=d.knowledge.stories.filter((s:any)=>d.knowledge.books.some((b:any)=>b.id===s.book));
 d.knowledge.materials=d.knowledge.materials.filter((n:any)=>visible(d,n));
 d.v5.knowledgeCenter=d.knowledge;delete d.memories;return d;
}
