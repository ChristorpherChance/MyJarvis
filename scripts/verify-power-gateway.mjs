import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {withPlatform,primary,remote,lanProfile} from './managed-server-client.mjs';
const report={at:new Date().toISOString(),checks:[]};
await withPlatform(async({api})=>{
 const power=await api('/api/runtime/power'),settings=await api('/api/settings/pi'),caps=await api('/api/runtime/remote-ops/capabilities');
 assert.equal(power.localNodes,3);assert.equal(power.excludedNodes,2);assert.equal(power.estimatedNodes,3);assert(power.total);
 for(const node of power.nodes){if(node.status==='excluded'){assert.equal(node.estimate,null);continue;}assert.equal(node.status,'estimated');assert.equal(node.estimate.method,'rapl-plus-components');assert(node.cpuPackage&&node.cpuPackage.scope==='cpu-package-only');assert(node.estimate.maximumWatts>node.estimate.minimumWatts);assert.equal(node.estimate.confidence,'low');const age=Date.now()-Date.parse(node.cpuPackage.observedAt);assert(age<30000&&age>=-10000);const history=await api('/api/v1/execution/monitoring?kind=machine&id='+node.machineId+'&window=1h&points=30');assert(history.data.points.some(p=>p.values.cpuPackageWatts?.count>0));}
 report.checks.push('three-fresh-signed-package-readings-and-clearly-separated-whole-box-estimates','two-cloud-servers-excluded','actual-package-power-history-persisted');
 assert.equal(settings.gateway.baseUrl,'https://gw.superopen.top');assert.equal(settings.gateway.api,'anthropic-messages');assert(!('apiKey' in settings));assert(caps.controllerOnline);report.checks.push('pi-gateway-preset-without-credential-disclosure','independent-control-still-online');report.power=power;report.gateway=settings.gateway;
});
const nodes=[];
for(const id of ['101','112','116']){const result=JSON.parse(remote(lanProfile,'jarvis-'+id,`import subprocess,json
from pathlib import Path
print(json.dumps({'sample':json.loads(Path('/var/lib/jarvis-power-sampler/summary.json').read_text()),'timerActive':subprocess.run(['systemctl','is-active','--quiet','jarvis-power-sampler.timer']).returncode==0,'businessActive':subprocess.run(['systemctl','is-active','--quiet','jarvis-platform.service']).returncode==0}))
`,true));assert(result.timerActive);if(id==='101')assert.equal(result.businessActive,false);if(id==='112')assert.equal(result.businessActive,true);nodes.push({id,...result});}
report.nodes=nodes;report.checks.push('local-sampler-timers-active-and-101-business-cold');report.status='passed';await mkdir('artifacts/power-gateway',{recursive:true});await writeFile('artifacts/power-gateway/live-verification.json',JSON.stringify(report,null,2));console.log(JSON.stringify({status:report.status,checks:report.checks,power:report.power.total,gatewayCredentialConfigured:report.gateway.credentialConfigured}));
