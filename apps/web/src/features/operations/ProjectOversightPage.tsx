import {useDemo} from '../../demo/context';
import {Button,Empty,type Props} from './common';
import {useSoftwareFactoryState} from './SoftwareFactoryPanel';
import ProjectSupervisionWorkPanel from './ProjectSupervisionWorkPanel';
import ProjectSupervisorPanel from './ProjectSupervisorPanel';
export function ProjectOversightPage({data,navigate,target}:Props){
 const {mode,notify}=useDemo(),factory=useSoftwareFactoryState(mode==='live');
 const requested=target?.split('/')[1]?.split('?')[0],project=requested?data.projects.find(x=>x.id===requested):data.projects.find(x=>x.id===factory?.sourceProjectId)??data.projects[0];
 if(mode!=='live')return <Empty title="项目监管使用真实平台记录" detail="请登录完整平台，查看实际事项、运行回执和完成简报。"/>;
 if(!project)return <Empty title={requested?'项目不存在或当前身份不可访问':'尚无可监管的项目'} detail="请先登记项目；不会以模拟数据代替。"/>;
 return <div className="project-oversight-page"><header className="oversight-page-header"><div><span className="oversight-eyebrow">PROJECT OVERSIGHT</span><h1>项目监管</h1><p>先看现状和下一步，需要时再展开依据。</p></div><div className="oversight-project-tools"><label>当前项目<select aria-label="监管项目" value={project.id} onChange={e=>navigate('supervision/'+encodeURIComponent(e.target.value))}>{data.projects.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label><Button kind="ghost" onClick={()=>{const link=new URL(location.href);link.search='?mode=platform';link.hash=new URLSearchParams({view:'supervision/'+project.id,theme:data.theme,board:'all'}).toString();void navigator.clipboard.writeText(link.href).then(()=>notify('监管链接已复制；远程打开仍需本人登录。')).catch(()=>notify('此浏览器未能复制，请从地址栏复制监管链接。'))}}>复制监管链接</Button><Button kind="ghost" onClick={()=>navigate('settings/policy')}>提醒设置</Button></div></header><ProjectSupervisorPanel key={'agent-'+project.id} projectId={project.id} data={data}/><ProjectSupervisionWorkPanel key={project.id} projectId={project.id} navigate={navigate} consoleMode/></div>;
}
