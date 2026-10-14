import {writeFile,mkdir} from 'node:fs/promises';
import {remote,lanProfile,python,withPlatform} from './managed-server-client.mjs';
const infrastructure=JSON.parse(remote(lanProfile,'jarvis-101',python({},`from pathlib import Path
import json,shutil,subprocess
root=Path('/home/superopen/All-Projects/msf')
out={'packages':[],'testFiles':[],'configs':[],'binaries':{},'containers':None}
for path in [root/'package.json',*root.glob('apps/*/package.json'),*root.glob('packages/*/package.json')]:
 if path.is_symlink() or path.stat().st_size>20000:continue
 j=json.loads(path.read_text());out['packages'].append({'path':str(path.relative_to(root)),'name':j.get('name'),'scripts':j.get('scripts'), 'testDependencies':{k:v for k,v in j.get('devDependencies',{}).items() if any(s in k for s in ['test','playwright','pg','postgres'])}})
for path in root.rglob('*'):
 if path.is_symlink() or any(s in path.parts for s in ['node_modules','.git','dist','.claude','.codex','data','logs','uploads']):continue
 rel=str(path.relative_to(root))
 if path.is_file() and (rel.endswith(('.test.ts','.spec.ts','.test.tsx','.spec.tsx'))):out['testFiles'].append(rel)
 if path.is_file() and (path.name.startswith(('vitest.config','playwright.config','docker-compose','compose.')) or path.name in ['pnpm-workspace.yaml','README.md'] and rel in ['README.md','pnpm-workspace.yaml','doc/tests/README.md']):out['configs'].append(rel)
for binary in ['docker','psql','redis-server','postgres','initdb','podman','git','chromium','chromium-browser']:
 out['binaries'][binary]=shutil.which(binary)
if out['binaries']['docker']:
 r=subprocess.run([out['binaries']['docker'],'ps','--format','{{.Names}}\\t{{.Image}}'],capture_output=True,text=True,timeout=10)
 out['containers']={'exitCode':r.returncode,'items':r.stdout.splitlines()}
r=subprocess.run(['/usr/bin/systemctl','is-active','jarvis-software-factory-development.service'],capture_output=True,text=True,timeout=10);out['agentService']=r.stdout.strip()
print(json.dumps(out))
`),true));
const platform=await withPlatform(async({api})=>{
 const [health,config,caps,agents,runs,project,supervision]=await Promise.all(['/api/health','/api/v1/execution/config','/api/v1/execution/capabilities','/api/v1/execution/agents','/api/v1/execution/runs','/api/v1/projects/70ec346f-6520-46ed-abed-22cac770a3e4','/api/v1/execution/supervision'].map(path=>api(path)));
 return {health,config:config.data,caps:caps.data,agents:agents.data,runs:(runs.data??[]).map(r=>({id:r.id,taskId:r.objectId,executorId:r.executorId,machineId:r.machineId,status:r.status})),project:project.data,supervision:supervision.data};
});
const result={at:new Date().toISOString(),infrastructure,platform,readOnly:true};
await mkdir('artifacts/software-factory/full-test',{recursive:true});await writeFile('artifacts/software-factory/full-test/preflight.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result));
