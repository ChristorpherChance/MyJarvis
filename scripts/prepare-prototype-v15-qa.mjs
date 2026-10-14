import fs from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
for(const name of ['capture-prototype-v14-previews.cjs','verify-prototype-v14-package.cjs']){
 let source=await fs.readFile(path.join(root,'scripts',name),'utf8');
 source=source.replaceAll('prototype-v14-qa','prototype-v15-qa').replaceAll('贾维斯V14.0','贾维斯V15.0').replaceAll('jarvis-v14-cinematic-preferences','jarvis-v15-cinematic-preferences').replaceAll('V14 ·','V15 ·');
 if(name.startsWith('capture'))source=source.replace("await p.evaluate(t=>J7.apply(t),t);","await p.evaluate(t=>{J7.apply(t);J15Graphics.setMap('domains')},t);");
 if(name.startsWith('verify'))source=source.replace("const bottom=",`const semantics=await p.evaluate(()=>{
   const tasks=S.tasks,services=J5.state().ops.services;
   try{
    S.tasks=[{status:'waitingResource'},{status:'unknown'}];
    J5.state().ops.services=[{host:S.machines.find(m=>m.status==='online').id,health:'unknown'}];
    const box=document.createElement('div');box.innerHTML=J15Graphics.metrics();
    const task=box.querySelector('[data-id="tasks"]').getAttribute('aria-label'),health=box.querySelector('[data-id="services"]').getAttribute('aria-label');
    return task.includes('待处理 0')&&task.includes('待执行 1')&&task.includes('待核实 1')&&health.includes('异常或离线 0')&&health.includes('待检查 1')&&!/NaN|Infinity/.test(box.innerHTML);
   }finally{S.tasks=tasks;J5.state().ops.services=services}
  });if(!semantics)throw Error('Unknown and queued state categories incorrect');checks.push('unknown states stay neutral; resource waits stay queued');
  const bottom=`);
 await fs.writeFile(path.join(root,'scripts',name.replace('v14','v15')),source);
}
console.log('V15 preview and package checks prepared');
