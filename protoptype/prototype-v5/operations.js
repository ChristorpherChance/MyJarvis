(function(){
  const state=()=>J5.state().ops;
  const svc=id=>state().services.find(s=>s.id===id);
  const dep=id=>state().deployments.find(d=>d.id===id);
  const rel=id=>state().releases.find(r=>r.id===id);
  const h=s=>machine(s.host)?.status!=='online'?'offline':s.health;
  const health=s=>badge(h(s)==='healthy'?'健康':h(s)==='degraded'?'需关注':h(s)==='offline'?'节点离线':'服务异常',h(s)==='healthy'?'green':h(s)==='degraded'?'amber':'red');
  const envLabel=x=>({test:'测试',staging:'预发布',production:'正式'})[x]||x;
  const dLabel=d=>({requested:'待审批',ready:'待执行',deploying:'部署中',verifying:'待验证',healthy:'验证通过',failed:'验证失败',restoring:'恢复中',restored:'已恢复',rejected:'已拒绝'})[d.status]||d.status;
  const action=(name,run,needsAdmin=true)=>J5.actions[name]={admin:needsAdmin,run};
  function registerApproval(d,s){
    if(S.approvals.some(a=>a.deployment===d.id)||d.status!=='requested')return;
    const a={id:'approval-'+d.id,kind:'deployment',deployment:d.id,title:'部署 '+s.name+' · '+d.version,
      target:s.name+' / '+envLabel(d.environment),level:'L2',status:'pending',
      summary:'绑定版本 '+d.version+'，恢复点 '+d.snapshot+'。'+d.reason,
      backup:d.snapshot,rollback:'恢复 '+d.previousVersion+' 并核对业务健康',time:d.time,task:null};
    S.approvals.unshift(a);d.approval=a.id;
  }
  J5.initializers.push(v=>{
    if(v.ops){v.ops.deployments.forEach(d=>{const s=v.ops.services.find(s=>s.id===d.service);if(s)registerApproval(d,s)});return}
    v.ops={
      services:[
        {id:'svc-core',name:'Jarvis Core',desc:'身份、任务协调和统一入口',project:'p1',host:'i3-01',environment:'production',version:'v0.4.2',method:'systemd · 模拟',entry:'https://jarvis.home',healthPath:'/health',health:'healthy',latency:32,uptime:'12 天 08 小时',backup:'core-20261003-0300',last:'刚刚',logs:['09:42 任务事件已写入，幂等检查通过','09:41 身份范围验证通过','03:00 核心状态快照验证通过'],readonly:false},
        {id:'svc-learning',name:'家庭学习服务',desc:'课程安排、学习进度和故事播放',project:'p1',host:'i3-02',environment:'production',version:'v0.3.6',method:'容器 · 模拟',entry:'https://learn.home',healthPath:'/ready',health:'healthy',latency:48,uptime:'8 天 16 小时',backup:'learning-20261003-0300',last:'刚刚',logs:['09:35 本人课程记录保存成功','09:30 故事音频队列可用'],readonly:false},
        {id:'svc-index',name:'知识检索 · 预发布',desc:'原文与经验检索接口',project:'p5',host:'i3-06',environment:'staging',version:'v0.8.1',method:'进程 · 模拟',entry:'http://index.staging:8080',healthPath:'/health',health:'degraded',latency:186,uptime:'1 天 02 小时',backup:'index-v0.8.1-snapshot',last:'1 分钟前',logs:['09:40 索引队列积压，等待节点唤醒','09:38 已保护正式原文版本'],readonly:false},
        {id:'svc-oa',name:'OA-AI · 公司样例',desc:'仅展示已选择的项目摘要与健康',project:'p4',host:'hp',environment:'test',version:'demo-0.7',method:'公司进程 · 示例登记',entry:'已隐藏 · 指定范围',healthPath:'已选择的健康摘要',health:'healthy',latency:55,uptime:'最近上报 09:42',backup:'公司侧管理',last:'刚刚',logs:['09:42 指定项目健康摘要收到'],readonly:true}
      ],
      releases:[{id:'rel-initial',name:'知识检索阶段交付',project:'p5',version:'v0.8.2-demo',task:null,status:'ready',criteria:'索引与来源过滤的模拟阶段验收通过',evidence:['24 项阶段检查通过 · 示例','构建产物已归档 · 示例','配置引用与恢复说明齐全'],artifact:'/artifacts/knowledge-index-v0.8.2-demo',time:'09:20'}],
      deployments:[{id:'deploy-initial',service:'svc-index',release:'rel-initial',version:'v0.8.2-demo',previousVersion:'v0.8.1',environment:'staging',status:'requested',snapshot:'index-v0.8.1-snapshot',reason:'发布来源权限过滤与索引更新',events:['09:20 交付包登记','09:22 提交预发布申请，等待决定'],tests:[],time:'09:22',approved:false}],
      policy:{humanReserve:70,voiceReserve:10,batchLimit:2,quiet:'22:00–07:00',autotest:true},
      events:[{text:'知识检索预发布需要处理',time:'09:22'},{text:'核心与学习服务健康检查通过',time:'09:42'}]
    };
    v.ops.deployments.forEach(d=>registerApproval(d,v.ops.services.find(s=>s.id===d.service)));
  });
  J5.routes.services=()=>{
    const o=state(),tab=U.opsTab||'services';
    let content='';
    if(tab==='releases')content='<div class="grid2">'+o.releases.map(r=>'<article class="card card-pad"><div class="row between">'+badge('阶段交付','green')+'<span class="tiny muted">'+E(r.time)+'</span></div><h3 class="mt16">'+E(r.name)+'</h3><p class="small muted mt16">'+E(project(r.project)?.name||'项目')+' · '+E(r.version)+'</p><div class="op5-evidence">'+r.evidence.map(e=>'<div>'+I('check',15)+E(e)+'</div>').join('')+'</div><div class="row wrap mt20">'+B('查看交付包','v5-op-release',r.id,'primary compact','file')+B('发起部署','v5-op-new-deploy',r.id,'compact','upload')+'</div></article>').join('')+'</div>';
    else if(tab==='deployments')content='<section class="card"><div class="table-scroll"><table class="data-table"><thead><tr><th>目标应用 / 版本</th><th>环境</th><th>执行状态</th><th>恢复点</th><th>操作</th></tr></thead><tbody>'+o.deployments.map(d=>'<tr><td><strong>'+E(svc(d.service)?.name||d.service)+'</strong><div class="tiny muted">'+E(d.version)+'</div></td><td>'+badge(envLabel(d.environment),d.environment==='production'?'amber':'blue')+'</td><td>'+badge(dLabel(d),d.status==='healthy'||d.status==='restored'?'green':d.status==='failed'?'red':'amber')+'</td><td class="tiny muted">'+E(d.snapshot)+'</td><td>'+B('查看过程','v5-op-deployment',d.id,'compact','arrow')+'</td></tr>').join('')+'</tbody></table></div></section>';
    else content='<div class="op5-service-grid">'+o.services.map(s=>'<article class="card op5-service"><div class="row between"><span class="op5-icon">'+I('cloud',24)+'</span>'+health(s)+'</div><h3 class="mt20"><button class="task-title-button" data-act="v5-op-service" data-id="'+s.id+'">'+E(s.name)+'</button></h3><p class="small muted mt16">'+E(s.desc)+'</p><div class="op5-service-meta">'+kv('执行主机',machine(s.host)?.name||s.host)+kv('运行版本',s.version)+kv('环境',envLabel(s.environment))+kv('响应',s.latency+' ms · 示例')+'</div><div class="row between mt20"><span class="tiny muted">'+(s.readonly?'指定范围 · 只读接入':'上报 '+E(s.last))+'</span>'+B('管理应用','v5-op-service',s.id,'compact','arrow')+'</div></article>').join('')+'</div>';
    return pageHead('在线应用与交付部署','把运行服务、研发项目、交付版本与机器分别管理。所有运行指标为模拟。',B('登记已有应用','v5-op-register','','primary','plus'))+
      '<div class="grid4 mb20">'+metric('已登记应用',o.services.length,'支持进程、服务与容器','cloud','',false)+metric('健康服务',o.services.filter(s=>h(s)==='healthy').length,'按本次模拟检查','check','green',false)+metric('待处理部署',o.deployments.filter(d=>['requested','ready','verifying','failed'].includes(d.status)).length,'每个版本有独立过程','upload','amber',false)+metric('可用交付包',o.releases.length,'阶段验收与项目交付分别记录','file','purple',false)+'</div>'+
      '<div class="tabs">'+[['services','运行应用'],['releases','交付包'],['deployments','部署与恢复']].map(t=>'<button class="'+(tab===t[0]?'active':'')+'" data-act="v5-op-tab" data-id="'+t[0]+'">'+t[1]+'</button>').join('')+'</div>'+content;
  };
  action('v5-op-tab',id=>{U.opsTab=id;closeOverlay();if(U.route!=='services')navigate('services');else render()});
  action('v5-op-service',id=>{if(svc(id))J5.open('op-service',id)});
  action('v5-op-service-tab',id=>{U.opsDetail=id;renderOverlay()});
  action('v5-op-register',()=>J5.open('op-register'));
  action('v5-op-edit',id=>J5.open('op-register',id));
  action('v5-op-release',id=>{if(rel(id))J5.open('op-release',id)});
  action('v5-op-new-deploy',id=>J5.open('op-new-deploy',id));
  action('v5-op-deployment',id=>{if(dep(id))J5.open('op-deployment',id)});
  action('v5-op-refresh',id=>{
    const s=svc(id);s.last=now();s.logs.unshift(now()+' 模拟健康检查：'+(h(s)==='healthy'?'通过':'需要处理'));
    record('检查在线应用',s.name,h(s));J5.commit('已更新模拟检查结果。');
  });
  action('v5-op-fault',id=>{
    const s=svc(id);if(!s||s.readonly)return toast('该应用仅只读接入。',true);
    s.health=s.health==='healthy'?'down':'healthy';s.logs.unshift(now()+' 演示场景：服务'+(s.health==='healthy'?'恢复':'异常'));
    record('模拟服务状态变化',s.name,s.health);J5.commit('已更新模拟服务状态，研发任务未被暂停。');
  });
  action('v5-op-backup',id=>{
    const s=svc(id);if(!s||s.readonly)return toast('备份由公司侧管理。',true);
    s.backup=s.id+'-snapshot-'+Date.now();s.logs.unshift(now()+' 创建并验证模拟快照 '+s.backup);record('应用快照',s.name,'已验证');J5.commit('模拟快照已登记。');
  });
  action('v5-op-approve',id=>{
    const d=dep(id);if(!d||d.status!=='requested')return;
    d.approved=true;d.status='ready';d.events.push(now()+' 本人批准指定版本与目标环境');
    const a=S.approvals.find(a=>a.deployment===id);if(a){a.status='approved';a.reason='本人批准该版本与目标';a.receipt='审批通过；部署尚未执行。'}
    record('批准部署 '+d.version,svc(d.service).name,'待执行');J5.commit('已批准这个版本，尚未执行部署。');
  });
  action('v5-op-reject',id=>{
    const d=dep(id);if(d?.status!=='requested')return;
    d.status='rejected';d.events.push(now()+' 拒绝部署，未变更服务');
    const a=S.approvals.find(a=>a.deployment===id);if(a){a.status='rejected';a.receipt='部署拒绝，未变更服务。'}
    record('拒绝部署',svc(d.service).name,'未执行');J5.commit('已拒绝，在线版本保持原状态。');
  });
  action('v5-op-execute',id=>{
    const d=dep(id),s=d&&svc(d.service);if(!d||!s||d.status!=='ready')return;
    if(machine(s.host)?.status!=='online')return toast('执行节点尚未在线，请先唤醒或选择其他环境。',true);
    if(S.settings.emergency)return toast('全局急停中，部署未派发。',true);
    if(s.environment!==d.environment||s.version!==d.previousVersion||(d.host&&s.host!==d.host))return toast('目标环境、节点或原版本已改变，请创建新的部署申请。',true);
    d.status='verifying';d.events.push(now()+' 保存恢复点 '+d.snapshot,now()+' 模拟部署完成，等待健康验证');s.version=d.version;s.health='degraded';s.logs.unshift(now()+' 部署 '+d.version+'，等待验证');
    record('执行模拟部署',s.name,'待验证');J5.commit('部署已进入待验证，尚未算作上线成功。');
  });
  action('v5-op-verify',id=>{
    const d=dep(id),s=d&&svc(d.service);if(d?.status!=='verifying')return;
    if(machine(s.host)?.status!=='online')return toast('节点离线，不能通过健康验证。',true);
    d.status='healthy';d.tests=['进程与入口可用 · 示例','业务健康检查通过 · 示例','版本与配置引用匹配 · 示例'];d.events.push(now()+' 模拟验证通过，生成部署回执');s.health='healthy';s.last=now();s.logs.unshift(now()+' '+d.version+' 模拟健康验证通过');
    const a=S.approvals.find(a=>a.deployment===id);if(a)a.receipt='模拟部署与业务健康验证通过：'+d.version;
    record('部署验证通过',s.name,d.version);J5.commit('已生成带验证证据的模拟部署回执。');
  });
  action('v5-op-verify-fail',id=>{
    const d=dep(id),s=d&&svc(d.service);if(d?.status!=='verifying')return;
    d.status='failed';d.tests=['业务检查未通过 · 演示'];d.events.push(now()+' 模拟验证失败，等待恢复决定');s.health='down';record('部署验证失败',s.name,'待恢复');J5.commit('验证失败，需要按恢复点处理。');
  });
  action('v5-op-restore',id=>{
    const d=dep(id);if(!d||!['failed','healthy'].includes(d.status))return;
    d.status='restoring';d.events.push(now()+' 已请求恢复 '+d.snapshot+'，尚未确认完成');record('开始恢复',svc(d.service).name,'恢复中');J5.commit('恢复请求已记录，请完成恢复验证。');
  });
  action('v5-op-restore-verify',id=>{
    const d=dep(id),s=d&&svc(d.service);if(d?.status!=='restoring')return;
    if(machine(s.host)?.status!=='online')return toast('节点离线，恢复无法确认完成。',true);
    s.version=d.previousVersion;s.health='healthy';s.last=now();d.status='restored';d.tests=['恢复点版本已核对 · 示例','恢复后的业务健康检查通过 · 示例'];d.events.push(now()+' 已恢复 '+d.previousVersion+'，模拟健康检查通过');record('恢复验证完成',s.name,d.previousVersion);J5.commit('对应版本已恢复并验证。');
    const a=S.approvals.find(a=>a.deployment===id);if(a){a.status='rolledback';a.receipt='对应版本 '+d.previousVersion+' 已恢复并通过模拟验证。';persist()}
  });
  action('v5-op-receipt',id=>{
    const d=dep(id);if(!d)return;
    download('部署回执-'+d.id+'.md','# 模拟部署回执\n\n应用：'+svc(d.service).name+'\n版本：'+d.version+'\n环境：'+envLabel(d.environment)+'\n结果：'+dLabel(d)+'\n\n'+d.events.join('\n')+'\n\n验证：\n'+d.tests.join('\n'));
  });
  action('v5-op-pack-task',id=>{
    const t=task(id);if(!t||t.status!=='completed'||t.mode==='observe')return toast('需要已验收的托管任务才能登记交付包。',true);
    const existing=state().releases.find(r=>r.task===id);if(existing)return J5.open('op-release',existing.id);
    const r={id:'rel-'+Date.now(),name:t.title+' · 阶段交付',project:t.project,version:'demo-'+Date.now().toString().slice(-6),task:id,status:'ready',criteria:t.criteria,evidence:[t.tests||'阶段检查通过',...t.artifacts,'配置引用、使用与恢复说明 · 模拟模板'],artifact:t.worktree+'/artifacts',time:now()};
    state().releases.unshift(r);record('生成阶段交付包',project(t.project)?.name||t.project,'验收证据已绑定');persist();J5.open('op-release',r.id);render();
  });
  J5.overlays['op-service']=id=>{
    const s=svc(id);if(!s)return closeOverlay();const tab=U.opsDetail||'overview';
    let body='<div class="row between mb20">'+health(s)+badge(s.readonly?'只读接入':envLabel(s.environment),s.readonly?'amber':'blue')+'</div><div class="tabs">'+[['overview','运行资料'],['logs','日志与事件'],['versions','部署版本'],['backup','备份与恢复']].map(t=>'<button class="'+(tab===t[0]?'active':'')+'" data-act="v5-op-service-tab" data-id="'+t[0]+'">'+t[1]+'</button>').join('')+'</div>';
    if(tab==='logs')body+='<div class="code-block">'+s.logs.map(l=>'<div>'+E(l)+'</div>').join('')+'</div><div class="notice mt20">'+I('info',16)+'日志为模拟内容，凭证只保存引用。</div>';
    else if(tab==='versions')body+='<div class="detail-grid">'+kv('当前运行',s.version)+kv('所属项目',project(s.project)?.name||'未关联')+'</div><div class="stack mt20">'+state().deployments.filter(d=>d.service===id).map(d=>'<div class="artifact"><span class="grow">'+E(d.version)+'<small>'+dLabel(d)+' · '+E(d.time)+'</small></span>'+B('查看','v5-op-deployment',d.id,'compact')+'</div>').join('')+'</div>';
    else if(tab==='backup')body+='<div class="notice mb20">'+I('shield',18)+'恢复请求、执行与验证分别记录。</div>'+kv('最近恢复点',s.backup)+'<div class="row wrap mt20">'+(!s.readonly?B('创建模拟快照','v5-op-backup',id,'primary','save'):'')+B('查看部署恢复','v5-op-tab','deployments','','history')+'</div>';
    else body+='<div class="detail-grid">'+kv('主机',machine(s.host)?.name||s.host)+kv('环境',envLabel(s.environment))+kv('部署版本',s.version)+kv('运行方式',s.method)+kv('访问入口',s.entry)+kv('健康检查',s.healthPath)+kv('关联研发项目',project(s.project)?.name||'未关联')+kv('运行时间',s.uptime)+'</div><div class="notice mt20">'+I('link',18)+'暂停开发只影响研发任务；服务运行与运维变更独立管理。</div><div class="row wrap mt20">'+B('查看机器','machine',s.host,'compact','machine')+B('查看项目','project',s.project,'compact','project')+(!s.readonly?B('模拟异常 / 恢复','v5-op-fault',id,'compact','info'):'')+'</div>';
    drawer(s.name,s.desc,body,B('刷新模拟检查','v5-op-refresh',id,'','refresh')+(!s.readonly?B('编辑登记','v5-op-edit',id,'primary','edit'):''));
  };
  J5.overlays['op-register']=id=>{
    const s=svc(id)||{};
    if(s.readonly)return toast('公司样例仅只读接入。',true);
    modal(s.id?'修改应用登记':'登记已经运行的应用',formStart('v5-op-service',id)+field('应用名称','name',s.name||'','','required maxlength="70"')+field('业务作用','desc',s.desc||'')+selectField('所在主机','host',S.machines.map(m=>[m.id,m.name]),s.host||'i3-01')+selectField('环境','environment',[['test','测试'],['staging','预发布'],['production','正式']],s.environment||'test')+selectField('关联项目','project',S.projects.map(p=>[p.id,p.name]),s.project||'p1')+field('运行版本','version',s.version||'v0.1.0-demo','','required')+field('运行方式','method',s.method||'系统服务 · 模拟')+field('访问入口','entry',s.entry||'http://demo.local')+field('健康检查','healthPath',s.healthPath||'/health')+'<div class="notice full">'+I('eye',18)+'先以只读登记与健康监测接入，不连接真实应用。</div>'+formEnd(),formFooter('保存登记','v5-op-service'),true);
  };
  J5.forms['v5-op-service']={admin:true,run(f,id){
    let s=svc(id);const values={name:f.name.trim(),desc:f.desc.trim(),host:f.host,environment:f.environment,project:f.project,version:f.version.trim(),method:f.method.trim(),entry:f.entry.trim(),healthPath:f.healthPath.trim()};
    if(!values.name||!values.version)return toast('请填写名称与版本。',true);
    if(s)Object.assign(s,values);else{ s={id:'svc-'+Date.now(),health:'healthy',latency:40,uptime:'刚登记 · 示例',backup:'尚未登记',last:now(),logs:[now()+' 应用登记完成 · 示例'],readonly:false,...values};state().services.unshift(s) }
    U.opsDetail='overview';record('保存应用登记',s.name,'只读接入');closeOverlay();persist();navigate('services');J5.open('op-service',s.id);
  }};
  J5.overlays['op-release']=id=>{
    const r=rel(id);if(!r)return closeOverlay();
    drawer(r.name,'阶段交付包 · 与整个项目完成分别验收','<div class="row between mb20">'+badge('可用于指定环境','green')+badge(r.version,'blue')+'</div><div class="detail-grid">'+kv('关联项目',project(r.project)?.name||r.project)+kv('产出目录',r.artifact)+'</div><h3 class="mt24">验收条件</h3><p class="small muted mt16">'+E(r.criteria)+'</p><h3 class="mt24">交付证据</h3><div class="op5-evidence">'+r.evidence.map(e=>'<div>'+I('check',16)+E(e)+'</div>').join('')+'</div><div class="notice mt20">'+I('shield',18)+'部署会绑定这个版本、目标环境与恢复点；正式环境需要独立决定。</div>',B('发起部署','v5-op-new-deploy',r.id,'primary','upload')+(r.task?B('查看研发任务','task',r.task,'','tasks'):''));
  };
  J5.overlays['op-new-deploy']=id=>{
    const r=rel(id);if(!r)return closeOverlay();
    const targets=state().services.filter(s=>!s.readonly&&s.project===r.project);
    if(!targets.length)return modal('先登记目标应用','<p>这个交付包所属项目尚未登记可部署的应用。请选择同一项目的运行目标。</p>',B('关闭','close-overlay')+B('登记已有应用','v5-op-register','','primary','plus'));
    modal('部署 '+r.version,formStart('v5-op-deploy',id)+selectField('目标应用','service',targets.map(s=>[s.id,s.name+' · '+envLabel(s.environment)]),targets[0].id)+field('部署理由','reason','验证本次阶段交付','textarea','required')+'<div class="notice full">'+I('shield',18)+'环境取自同一项目的目标应用。测试环境可按已授权策略自动进入待执行，正式环境总是生成独立审批。</div>'+formEnd(),formFooter('创建部署申请','v5-op-deploy'));
  };
  J5.forms['v5-op-deploy']={admin:true,run(f,id){
    const r=rel(id),s=svc(f.service);if(!r||!s||s.readonly)return;
    if(s.project!==r.project)return toast('交付包和目标应用必须属于同一项目。',true);
    const automatic=s.environment==='test'&&state().policy.autotest;
    const d={id:'dep-'+Date.now(),service:s.id,host:s.host,release:r.id,version:r.version,previousVersion:s.version,environment:s.environment,status:automatic?'ready':'requested',snapshot:s.id+'-'+s.version+'-predeploy',reason:f.reason.trim(),approved:automatic,time:now(),events:[now()+' 收到交付包 '+r.version,now()+' 绑定目标环境 '+envLabel(s.environment),now()+(automatic?' 已在测试环境授权范围内，待执行':' 等待本人批准指定版本')],tests:[]};
    state().deployments.unshift(d);registerApproval(d,s);record('提交部署申请',s.name,dLabel(d));closeOverlay();persist();navigate('services');U.opsTab='deployments';J5.open('op-deployment',d.id);render();
  }};
  J5.overlays['op-deployment']=id=>{
    const d=dep(id),s=d&&svc(d.service);if(!d||!s)return closeOverlay();
    const actions=d.status==='requested'?B('拒绝','v5-op-reject',id)+B('批准该版本','v5-op-approve',id,'primary','shield'):d.status==='ready'?B('执行模拟部署','v5-op-execute',id,'primary','upload'):d.status==='verifying'?B('模拟验证失败','v5-op-verify-fail',id,'danger')+B('验证通过','v5-op-verify',id,'primary','check'):['failed','healthy'].includes(d.status)?B('恢复对应快照','v5-op-restore',id,d.status==='failed'?'primary':'','history'):d.status==='restoring'?B('完成恢复验证','v5-op-restore-verify',id,'primary','check'):'';
    drawer(s.name+' · 部署过程','目标 '+envLabel(d.environment)+' / '+d.version,'<div class="row between mb20">'+badge(dLabel(d),['healthy','restored'].includes(d.status)?'green':d.status==='failed'?'red':'amber')+badge(d.environment==='production'?'正式环境 · 独立审批':'版本绑定','blue')+'</div><div class="op5-stages">'+[['交付','release'],['决定','approve'],['部署','deploy'],['验证','verify'],['回执','receipt']].map((x,i)=>'<span class="'+(i<({requested:1,ready:2,verifying:3,healthy:5,failed:3,restoring:3,restored:5,rejected:1}[d.status]||1)?'done':'')+'">'+(i+1)+' '+x[0]+'</span>').join('')+'</div><div class="detail-grid mt20">'+kv('版本',d.version)+kv('原版本',d.previousVersion)+kv('恢复点',d.snapshot)+kv('执行主机',machine(s.host)?.name||s.host)+'</div><p class="small muted mt20">'+E(d.reason)+'</p><h3 class="mt24">真实状态的模拟事件</h3><div class="code-block mt16">'+d.events.map(e=>'<div>'+E(e)+'</div>').join('')+'</div>'+(d.tests.length?'<h3 class="mt24">验证结果</h3><div class="op5-evidence">'+d.tests.map(t=>'<div>'+I('check',16)+E(t)+'</div>').join('')+'</div>':'')+'<div class="notice mt20">'+I('info',18)+'这是部署流程演示；没有访问真实主机、服务或备份。</div>',actions+B('下载回执','v5-op-receipt',id,'','download'));
  };
  J5.overlays['op-policy']=()=>modal('自动任务资源配额',formStart('v5-op-policy')+field('本人使用保留（%）','humanReserve',state().policy.humanReserve,'number','min="10" max="95" required')+field('语音预留（%）','voiceReserve',state().policy.voiceReserve,'number','min="0" max="30" required')+field('后台重任务并发','batchLimit',state().policy.batchLimit,'number','min="1" max="8" required')+field('安静时段','quiet',state().policy.quiet)+'<div class="notice full">'+I('cpu',18)+'本人和语音预留合计不超过 100%；批量任务只使用可调度配额。</div>'+formEnd(),formFooter('保存策略','v5-op-policy'));
  J5.forms['v5-op-policy']={admin:true,run(f){
    if(Number(f.humanReserve)+Number(f.voiceReserve)>100)return toast('两项预留不能超过 100%。',true);
    Object.assign(state().policy,{humanReserve:Number(f.humanReserve),voiceReserve:Number(f.voiceReserve),batchLimit:Number(f.batchLimit),quiet:f.quiet});record('更新自动任务配额','资源协调');closeOverlay();J5.commit('已保存模拟资源策略。');
  }};
  action('v5-op-policy',()=>J5.open('op-policy'));

  const originalTaskDetails=taskDetails;
  taskDetails=function(t){
    originalTaskDetails(t);
    if(t.status==='completed'&&t.mode==='managed')document.querySelector('.drawer-foot')?.insertAdjacentHTML('afterbegin',B('生成交付包','v5-op-pack-task',t.id,'primary','file'));
  };
  const originalApprovalDetails=approvalDetails;
  approvalDetails=function(a){if(a.kind==='deployment'&&dep(a.deployment))return J5.open('op-deployment',a.deployment);return originalApprovalDetails(a)};
  const originalApprovalCard=approvalCard;
  approvalCard=function(a){
    if(a.kind!=='deployment')return originalApprovalCard(a);
    const d=dep(a.deployment);
    return '<article class="card approval-card"><div class="row between">'+badge(d?dLabel(d):'记录不可用',d?.status==='healthy'||d?.status==='restored'?'green':d?.status==='failed'?'red':'amber')+'<span class="tiny muted">'+E(a.time)+'</span></div><h3 class="mt16">'+E(a.title)+'</h3><p class="muted small mt16">'+E(a.summary)+'</p><div class="approval-detail"><div>'+I('cloud',16)+' '+E(a.target)+'</div><div>'+I('shield',16)+' '+E(a.backup)+'</div></div><div class="approval-actions">'+B('查看发布决定与过程','approval',a.id,'primary compact','shield')+'</div></article>';
  };
  const originalProjectDetails=projectDetails;
  projectDetails=function(p){
    originalProjectDetails(p);
    const services=state().services.filter(s=>s.project===p.id);
    const root=document.querySelector('.drawer-body');
    if(root&&p.criteria)root.insertAdjacentHTML('beforeend','<h3 class="mt24">项目验收与研究依据</h3><p class="small muted mt16" style="white-space:pre-wrap">'+E(p.criteria)+'</p>'+(p.deliveryRequirements?'<div class="notice mt16">'+I('file',17)+E(p.deliveryRequirements)+'</div>':'')+(p.researchId?'<div class="row mt16">'+B('查看来源研究与决定','v5-rd-detail',p.researchId,'compact','bolt')+'</div>':''));
    if(root&&services.length)root.insertAdjacentHTML('beforeend','<h3 class="mt24">已经运行的应用</h3><div class="stack mt16">'+services.map(s=>'<div class="artifact"><div class="grow">'+E(s.name)+'<small>'+E(s.version)+' · '+envLabel(s.environment)+'</small></div>'+health(s)+B('运行详情','v5-op-service',s.id,'compact')+'</div>').join('')+'</div>');
  };
  const originalOpsOverlay=renderOverlay;
  renderOverlay=function(){
    const result=originalOpsOverlay();
    const p=U.overlay&&project(U.overlay.id);
    if(p?.criteria&&['project-plan','new-task'].includes(U.overlay.type)){
      const input=document.querySelector('#overlay-root textarea[name="criteria"]');
      if(input)input.value=p.criteria;
    }
    return result;
  };
  const originalMachineDetails=machineDetails;
  machineDetails=function(m){
    originalMachineDetails(m);
    const list=state().services.filter(s=>s.host===m.id),root=document.querySelector('.drawer-body');
    if(root&&list.length)root.insertAdjacentHTML('beforeend','<h3 class="mt24">登记的运行服务</h3>'+list.map(s=>'<div class="artifact"><span class="grow">'+E(s.name)+'<small>'+envLabel(s.environment)+' · '+E(s.version)+'</small></span>'+health(s)+B('应用详情','v5-op-service',s.id,'compact')+'</div>').join(''));
  };
  J5.snapshots.operations=()=>({summary:state().services.filter(s=>h(s)==='healthy').length+' 个应用健康，'+state().deployments.filter(d=>['requested','failed'].includes(d.status)).length+' 项需要决定',metrics:[{label:'运行应用',value:state().services.length},{label:'待部署',value:state().deployments.filter(d=>['requested','ready','verifying'].includes(d.status)).length}],pending:state().deployments.filter(d=>['requested','failed'].includes(d.status)).length});
  J5.snapshots.development=()=>({summary:activeTasks().length+' 项推进中，'+S.tasks.filter(t=>t.status==='blocked').length+' 项阻塞；目标与验收驱动续作',metrics:[{label:'执行 / 验证',value:activeTasks().length},{label:'阶段交付',value:state().releases.length}],pending:S.tasks.filter(t=>['blocked','approval','waitingQuota'].includes(t.status)).length});
  J5.snapshots.experience=()=>({summary:S.knowledge.filter(k=>k.kind==='experience').length+' 条经验，'+S.knowledge.filter(k=>k.kind==='skill'&&k.status==='可用').length+' 个可用 Skill',metrics:[{label:'正式技能',value:S.knowledge.filter(k=>k.kind==='skill'&&k.status==='可用').length},{label:'待验证',value:S.knowledge.filter(k=>!k.verified).length}],pending:S.knowledge.filter(k=>!k.verified).length});
  J5.boards.operations={title:'运行与资源指挥屏',subtitle:'服务健康、发布过程、恢复与机器资源',render(){
    return '<div class="grid4 mb20">'+metric('在线资产',S.machines.filter(m=>m.status==='online').length+' / '+S.machines.length,'最后上报 · 模拟','machine','',false)+metric('健康应用',state().services.filter(s=>h(s)==='healthy').length+' / '+state().services.length,'服务与开发状态独立','cloud','green',false)+metric('待处理发布',state().deployments.filter(d=>['requested','failed'].includes(d.status)).length,'指定版本与恢复点','upload','amber',false)+metric('本人资源保留',state().policy.humanReserve+'%','主力人工使用优先','cpu','purple',false)+'</div><div class="op5-board-cols"><section class="j5-board-panel"><div class="row between mb20"><h2>运行服务</h2>'+B('管理应用','nav','services','compact')+'</div>'+state().services.map(s=>'<div class="op5-board-service"><div class="grow"><strong>'+E(s.name)+'</strong><small>'+E(s.host)+' · '+E(s.version)+'</small></div>'+health(s)+B('查看','v5-op-service',s.id,'compact')+'</div>').join('')+'</section><section class="j5-board-panel"><div class="row between mb20"><h2>资源与任务窗口</h2>'+B('调整配额','v5-op-policy','','compact')+'</div><div class="op5-resource-wheel"><svg viewBox="0 0 180 180" role="img" aria-label="资源预留比例"><circle cx="90" cy="90" r="67" fill="none" stroke="#203b50" stroke-width="16"/><circle cx="90" cy="90" r="67" fill="none" stroke="#42b9d2" stroke-width="16" stroke-dasharray="'+(state().policy.humanReserve*4.21)+' 421" transform="rotate(-90 90 90)"/><text x="90" y="86" text-anchor="middle" fill="#d4edf7" font-size="28">'+state().policy.humanReserve+'%</text><text x="90" y="109" text-anchor="middle" fill="#83a6bc" font-size="11">本人使用预留</text></svg><div class="stack"><span class="small muted">语音预留 '+state().policy.voiceReserve+'%</span><span class="small muted">后台并发 '+state().policy.batchLimit+'</span><span class="small muted">安静时段 '+E(state().policy.quiet)+'</span></div></div><div class="notice">'+I('info',16)+'重任务只用剩余资源，语音有独立预留或已验证替代路线。</div></section></div><section class="j5-board-panel mt20"><div class="row between mb20"><h2>发布与恢复过程</h2>'+B('完整部署台账','v5-op-tab','deployments','compact')+'</div>'+state().deployments.map(d=>'<div class="op5-board-service"><div class="grow"><strong>'+E(svc(d.service)?.name||d.service)+'</strong><small>'+E(d.version)+' · '+envLabel(d.environment)+'</small></div>'+badge(dLabel(d),d.status==='healthy'?'green':d.status==='failed'?'red':'amber')+B('处理过程','v5-op-deployment',d.id,'compact')+'</div>').join('')+'</section>';
  }};
  J5.boards.development={title:'AI 研发指挥屏',subtitle:'明确目标、持续推进、证据验收与交付',render(){
    return '<div class="grid4 mb20">'+metric('正在推进',activeTasks().length,'执行与验证的真实状态模拟','bolt','',false)+metric('人工暂停',S.tasks.filter(t=>t.status==='paused').length,'暂停不会自动解除','pause','',false)+metric('需要处理',S.tasks.filter(t=>['blocked','approval','waitingQuota','waitingResource'].includes(t.status)).length,'输入、资源、预算与审批','shield','amber',false)+metric('已验收阶段',S.tasks.filter(t=>t.status==='completed').length,'项目目标与阶段分别计算','check','green',false)+'</div><div class="op5-board-cols"><section class="j5-board-panel"><div class="row between mb20"><h2>开发任务流</h2><div class="row gap8">'+B(S.settings.supervise?'暂停监督':'开启监督','toggle-supervise','','compact',S.settings.supervise?'pause':'play')+B('推进演示','advance','','compact','refresh')+'</div></div>'+S.tasks.filter(t=>!['completed','cancelled'].includes(t.status)).slice(0,7).map(taskRow).join('')+'</section><section class="j5-board-panel"><div class="row between mb20"><h2>交付与最近事件</h2>'+B('项目列表','nav','projects','compact')+'</div>'+state().releases.slice(0,3).map(r=>'<div class="op5-board-service"><div class="grow"><strong>'+E(r.name)+'</strong><small>'+E(r.version)+'</small></div>'+B('交付包','v5-op-release',r.id,'compact')+'</div>').join('')+'<div class="op5-event-list">'+S.activity.slice(0,6).map(a=>'<div><time>'+E(a.time)+'</time><span>'+E(a.text)+'</span></div>').join('')+'</div><div class="notice mt20">'+I('flag',17)+'达成约定目标后停在交付状态，新增需求形成新目标。</div></section></div>';
  }};
  J5.boards.experience={title:'经验与技能指挥屏',subtitle:'跨终端积累、验证、固定版本与使用反馈',render(){
    const skills=S.knowledge.filter(k=>k.kind==='skill');
    return '<div class="grid3 mb20">'+metric('经验记录',S.knowledge.filter(k=>k.kind==='experience').length,'带环境和适用条件','book','',false)+metric('可用 Skill',skills.filter(k=>k.status==='可用').length,'验证后发布固定版本','code','green',false)+metric('复用次数',S.knowledge.reduce((n,k)=>n+k.uses,0),'来自模拟使用记录','refresh','purple',false)+'</div><section class="j5-board-panel"><div class="row between mb20"><h2>技能版本与复用</h2><div class="row gap8">'+B('经验管理','nav','knowledge','compact')+B('快速收件','nav','inbox','compact')+'</div></div>'+skills.map(k=>'<div class="op5-board-service"><div class="grow"><strong>'+E(k.title)+'</strong><small>'+E(k.version)+' · '+k.uses+' 次使用 · '+E(k.status)+'</small></div>'+B('查看记录','knowledge-detail',k.id,'compact')+'</div>').join('')+'<div class="notice mt20">'+I('history',17)+'任务记录固定应用时的版本，后续更新不会改写既有使用记录。</div></section>';
  }};

  const domainInfo=[
    ['family','家庭与语音','family','chat','正在交互、个人学习与共同事项'],
    ['knowledge','知识神殿','book','temple','来源、校对、故事与知识缺口'],
    ['development','持续研发','code','tasks','开发目标、阻塞、验收与交付'],
    ['operations','运行与资源','machine','services','应用健康、部署与恢复'],
    ['research','灵感与深研','bolt','research','证据、方案、决定与项目转化'],
    ['experience','经验与 Skill','history','knowledge','终端经验、验证与版本复用']
  ];
  J5.routes.overview=()=>{
    const running=activeTasks().length,pending=pendingApprovals().length;
    return '<section class="j5-welcome"><div class="j5-welcome-copy"><div class="j5-eyebrow"><span></span> JARVIS PERSONAL INTELLIGENCE</div><h1>把今天，交给贾维斯。</h1><p>'+running+' 项研发正在推进。知识、经验和家庭事项，汇聚在同一个中枢。</p><div class="row wrap mt24">'+B('和贾维斯说句话','nav','chat','primary','mic')+B('进入总控大屏','v5-board','all','','screen')+B('原型体验指南','v5-guide','','ghost','info')+'</div><div class="j5-welcome-meta"><span>2026.10.03 · 模拟状态</span><span>'+P().name+'的管理空间</span><span>九个业务域 · 四个工作区</span></div></div><div class="j5-welcome-core" aria-hidden="true"><span class="j5-orbit a"></span><span class="j5-orbit b"></span><span class="j5-orbit c"></span><span class="j5-core-ball"><i>J</i></span><small>CONNECTED INTELLIGENCE</small></div></section><div class="grid4 mt24">'+metric('已登记资产',S.machines.length,'18 台电脑 · NAS · 2 台云','machine','',false)+metric('推进中的任务',running,'目标、验证与交付联动','code','purple',false)+metric('需要你决定',pending,'审批与版本部署分别记录','shield','amber',false)+metric('家庭学习',profiles.length+' 位成员','档案与私人记录分别管理','family','green',false)+'</div><div class="j5-overview-cols mt24"><section class="card"><div class="card-header"><h2>正在推进的工作</h2>'+B('全部任务','nav','tasks','ghost compact','arrow')+'</div>'+S.tasks.filter(t=>!['completed','cancelled'].includes(t.status)).slice(0,4).map(taskRow).join('')+'<div class="op5-bottom-note">'+I('shield',15)+'人工暂停、预算与验收边界持续生效。</div></section><section class="card"><div class="card-header"><h2>今天的关注</h2>'+badge('重要变化','blue')+'</div><div class="j5-attention">'+[
      ['shield','发布需要决定',state().deployments.filter(d=>d.status==='requested').length+' 项指定版本待审批','services'],
      ['edit','经典原文待校对',J5.summary('knowledge').summary||'进入校对台完成原文审核','collation'],
      ['bolt','灵感正在形成方案',J5.summary('research').summary||'研究证据与可行性等待确认','research']
    ].map(a=>'<button data-act="nav" data-id="'+a[3]+'"><span>'+I(a[0],19)+'</span><div class="grow"><strong>'+a[1]+'</strong><small>'+E(a[2])+'</small></div>'+I('arrow',15)+'</button>').join('')+'</div></section></div><div class="section-title"><h2>你的管家工作区</h2><span class="tiny muted">进入领域管理，或打开独立大屏</span></div><div class="j5-domain-grid">'+domainInfo.map(d=>{const snap=J5.summary(d[0]);return '<article class="card j5-domain-card"><div class="row between"><span class="j5-domain-icon">'+I(d[2],23)+'</span>'+B('大屏','v5-board',d[0],'ghost compact','screen')+'</div><h3>'+d[1]+'</h3><p>'+d[4]+'</p><div class="j5-domain-summary">'+E(snap.summary)+'</div><div class="row between"><span class="tiny muted">'+(snap.metrics||[]).slice(0,2).map(m=>E(m.label)+' '+E(m.value)).join(' · ')+'</span>'+B('进入','nav',d[3],'compact','arrow')+'</div></article>'}).join('')+'</div>';
  };
  function topology(){
    const nodes=[['knowledge','知识神殿',135,65],['family','家庭与记忆',460,65],['research','灵感与深研',565,205],['development','研发与交付',455,345],['operations','运行与资源',135,345],['experience','经验与技能',30,205]];
    return '<svg class="j5-topology" viewBox="-25 0 680 405" role="img" aria-label="公共中枢连接六个领域大屏">'+nodes.map(n=>'<path d="M300 205 L'+n[2]+' '+n[3]+'" stroke="#294b62" stroke-width="1.2" fill="none"/><circle r="3" fill="#3cb2cc"><animateMotion dur="4s" repeatCount="indefinite" path="M300 205 L'+n[2]+' '+n[3]+'"/></circle>').join('')+'<circle cx="300" cy="205" r="80" fill="#0c2537" stroke="#255c72"/><circle cx="300" cy="205" r="59" fill="#144051" stroke="#3495ad"/><text x="300" y="201" fill="#c7f4ff" font-size="27" text-anchor="middle" font-weight="600">JARVIS</text><text x="300" y="227" fill="#80b8cb" font-size="11" text-anchor="middle">身份 · 任务 · 事件 · 预算</text>'+nodes.map(n=>'<g role="button" tabindex="0" aria-label="打开'+n[1]+'大屏" data-act="v5-board" data-id="'+n[0]+'" class="j5-topology-node"><rect x="'+(n[2]-59)+'" y="'+(n[3]-23)+'" width="118" height="46" rx="8" fill="#163247" stroke="#31576e"/><text x="'+n[2]+'" y="'+(n[3]+5)+'" text-anchor="middle" fill="#b8d9e9" font-size="12">'+n[1]+'</text></g>').join('')+'</svg>';
  }
  J5.routes.screen=()=>{
    const manage=admin()&&!J5.isPublic();
    let key=J5.state().board||'all';if(!manage&&!['family','knowledge'].includes(key))key='family';
    const info=J5.boards[key],available=manage?[['all','全域总控'],...domainInfo.map(d=>[d[0],d[1]])]:[['family','家庭与语音'],['knowledge','知识与故事']];
    const title=key==='all'?'贾维斯 · 全域总控':info?.title||'家庭大屏';
    const header='<div class="j5-screen-head"><div class="row gap12"><span class="j5-screen-logo">J</span><div><div class="j5-eyebrow">JARVIS COMMAND SURFACE</div><h1>'+E(title)+'</h1><p>'+E(key==='all'?'九个业务域的共同状态，六块大屏的集合入口':info?.subtitle||'家庭共享信息与本人学习')+'</p></div></div><div class="j5-screen-tools"><span id="tv-clock">'+now()+'</span>'+B('语音询问','nav','chat','compact','mic')+B('全屏','fullscreen','','compact','fullscreen')+B('返回管理','exit-screen','','compact','close')+'</div></div><div class="j5-screen-tabs">'+available.map(x=>'<button class="'+(key===x[0]?'active':'')+'" data-act="v5-board" data-id="'+x[0]+'">'+x[1]+'</button>').join('')+'</div>';
    if(key!=='all')return header+(info?info.render():'<div class="j5-board-panel">领域正在接入。</div>')+'<div class="j5-screen-footer"><span class="j5-live-dot"></span>模拟事件与所有管理视图联动 · 当前身份 '+E(P().name)+'</div>';
    const snapOps=J5.summary('operations'),snapKnow=J5.summary('knowledge');
    return header+'<div class="grid4 mb20">'+metric('在线资产',S.machines.filter(m=>m.status==='online').length+' / '+S.machines.length,'资产完整登记，按需运行','machine','',false)+metric('推进中的目标',activeTasks().length,'研发执行 / 验证','code','green',false)+metric('知识生产',snapKnow.metrics?.[0]?.value||'进行中',snapKnow.metrics?.[0]?.label||'校对与故事发布','book','purple',false)+metric('需要决定',pendingApprovals().length,'具体对象与影响可检查','shield','amber',false)+'</div><div class="j5-command-cols"><section class="j5-board-panel j5-map-panel"><div class="row between"><h2>一个中枢 · 全域协作</h2>'+badge('事件驱动 · 模拟','blue')+'</div>'+topology()+'<div class="j5-map-foot"><span><i></i>语音与家庭优先</span><span><i></i>本人配额受到保护</span><span><i></i>目标与版本可追溯</span></div></section><section class="j5-board-panel"><div class="row between mb20"><h2>正在推进</h2>'+B('研发大屏','v5-board','development','compact')+'</div>'+S.tasks.filter(t=>!['completed','cancelled'].includes(t.status)).slice(0,4).map(taskRow).join('')+'<h2 class="mt24">运行与交付</h2><p class="small muted mt16">'+E(snapOps.summary)+'</p>'+state().deployments.filter(d=>['requested','verifying','failed'].includes(d.status)).slice(0,2).map(d=>'<div class="op5-board-service"><div class="grow"><strong>'+E(svc(d.service)?.name)+'</strong><small>'+E(d.version)+'</small></div>'+badge(dLabel(d),'amber')+B('过程','v5-op-deployment',d.id,'compact')+'</div>').join('')+'</section></div><div class="j5-screen-domain-grid mt20">'+domainInfo.map(d=>{const snap=J5.summary(d[0]);return '<button class="j5-screen-domain" data-act="v5-board" data-id="'+d[0]+'"><span class="j5-domain-icon">'+I(d[2],21)+'</span><div class="grow"><h3>'+d[1]+'</h3><p>'+E(snap.summary)+'</p><small>'+(snap.metrics||[]).slice(0,2).map(m=>E(m.label)+' '+E(m.value)).join(' · ')+'</small></div><span>'+I('arrow',18)+'</span></button>'}).join('')+'</div><div class="j5-screen-footer"><span class="j5-live-dot"></span>集合大屏仅显示当前身份可见的领域汇总 · 全部指标为模拟</div>';
  };
  document.addEventListener('keydown',e=>{
    if(['Enter',' '].includes(e.key)&&e.target.matches('.j5-topology-node')){e.preventDefault();handleAction('v5-board',e.target.dataset.id,e.target)}
  });
})();
