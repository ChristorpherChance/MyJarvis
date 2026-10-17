export interface ProjectRouteTask {id:string;projectId?:string;project?:string;}
/** Shared by initial hash, in-app navigation and browser history. Unresolved task links stay explicit. */
export function resolveProjectRoute(value:string,tasks:ProjectRouteTask[]=[]):string{
 const [path,query='']=value.split('?'),parts=path.split('/'),params=new URLSearchParams(query);
 if(parts[0]==='supervision')return parts[1]?`projects/${encodeURIComponent(decodeURIComponent(parts[1]))}${query?'?'+query:''}`:'projects';
 if(parts[0]!=='tasks')return value;
 if(parts[1]==='project'&&parts[2])return `projects/${parts[2]}${query?'?'+query:''}`;
 if(parts[1]==='new'){const projectId=params.get('projectId');if(projectId){params.set('intent','new-task');return `projects/${encodeURIComponent(projectId)}?${params}`;}return 'projects?intent=new-task';}
 if(!parts[1])return 'projects';
 const taskId=decodeURIComponent(parts.slice(1).join('/')),task=tasks.find(t=>t.id===taskId),projectId=task?.projectId??task?.project;
 if(projectId){params.set('task',taskId);return `projects/${encodeURIComponent(projectId)}?${params}`;}
 params.set('unresolvedTask',taskId);return `projects?${params}`;
}
