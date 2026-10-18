import {workbenchDetailRoute} from './project-plan-workbench-view';
import type { ComponentType } from 'react';
import { useDemo } from '../../demo/context';
import { ResearchPage, InboxPage } from './research';
import { ProjectsPage, TasksPage } from './work';
import {ProjectOversightPage} from './ProjectOversightPage';
import {ProjectWorkbenchPage} from './ProjectWorkbenchPage';
import { MachinesPage, ServicesPage, OperationsDashboard, ApprovalsPage } from './system';
import { ExperiencesPage } from './experience';
import { Button, Empty, Note } from './common';
import './operations.css';
export function OperationsPage({ route, navigate, target }: {
    route: string;
    navigate: (route: string) => void;
    target?: string;
}) {
    const { data, act, real, mode, refresh, discussWithPi } = useDemo();
    const props = { data, act, navigate, real, target };
    if (data.profile !== 'me' && !['inbox', 'knowledge'].includes(route))
        return <Empty title="这是管理者的工作空间" detail="家庭成员可以使用收件、资料与自己的学习空间。"/>;
    const views: Record<string, ComponentType<typeof props>> = { inbox: InboxPage, research: ResearchPage, projects: ProjectWorkbenchPage, supervision: ProjectWorkbenchPage, tasks: ProjectWorkbenchPage, knowledge: ExperiencesPage, machines: MachinesPage, services: ServicesPage, operations: OperationsDashboard, approvals: ApprovalsPage };
    const View = views[route];
    const domains: Record<string, string> = { inbox: 'inbox', research: 'research', projects: 'projects', tasks: 'tasks', knowledge: 'experiences' };
    const capability = real?.capabilities.domains.find(d => d.domain === domains[route]);
    const trueDomain = mode === 'live' && !!domains[route];
    const liveStrip=trueDomain && <div className="op-live-strip"><div><span className="op-live-dot"/>真实记录 <small>{capability?.description || '身份、范围与修订历史由服务保存'}</small></div><div className="op-actions"><Button kind="ghost" onClick={() => void refresh().catch(() => {})}>刷新记录</Button><Button kind="ghost" onClick={() => discussWithPi(`请只读查看我的${({inbox:'收件',research:'研究',projects:'项目',tasks:'任务',knowledge:'经验'} as Record<string,string>)[route]}，说明现状与下一步建议；任何修改先给我确认。`)}>与 Pi 讨论</Button></div></div>;
    const projectDetail=workbenchDetailRoute(route,target);
    const projectReport=trueDomain&&route==='tasks'&&target?.split('/')[1]==='project';
    return <div className="op-page">{!projectReport&&!projectDetail&&liveStrip}{View ? <View key={route} {...props}/> : <Empty title="页面不存在"/>}{projectReport&&<details className="project-autonomy-history"><summary>平台运行与操作</summary>{liveStrip}</details>}</div>;
}
