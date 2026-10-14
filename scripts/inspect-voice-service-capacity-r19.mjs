/** Read-only resource and readiness metadata; no transcript, audio, model request or service change. */
import {writeFile} from 'node:fs/promises';
import {primary,python} from './managed-server-client.mjs';
const program=String.raw`import subprocess,os,time,urllib.request
from pathlib import Path
properties=['ActiveState','SubState','MainPID','ControlGroup','CPUQuotaPerSecUSec','CPUQuotaPeriodUSec','CPUWeight','AllowedCPUs','EffectiveCPUs','TasksCurrent','MemoryCurrent']
r=subprocess.run(['systemctl','show','jarvis-voice.service','--property='+','.join(properties)],capture_output=True,text=True,check=True,timeout=10)
unit=dict(x.split('=',1) for x in r.stdout.splitlines() if '=' in x)
if unit.get('ControlGroup')!='/system.slice/jarvis-voice.service':raise RuntimeError('VOICE_CGROUP_SCOPE_CHANGED')
base=Path('/sys/fs/cgroup')/unit['ControlGroup'].lstrip('/')
cg={}
for name in ['cpu.max','cpu.stat','cpu.pressure','cpuset.cpus.effective']:
 q=base/name
 if q.exists():cg[name]=q.read_text().strip()
pid=int(unit.get('MainPID','0'));threads=None;whitelist={}
if pid>0:
 args=(Path('/proc')/str(pid)/'cmdline').read_bytes().split(b'\0')
 if b'--threads' in args:threads=int(args[args.index(b'--threads')+1])
 for line in (Path('/proc')/str(pid)/'status').read_text().splitlines():
  name,sep,value=line.partition(':')
  if name in ['Threads','VmRSS','Cpus_allowed_list']:whitelist[name]=value.strip()
key=Path('/var/lib/jarvis/voice-runtime/service-token').read_text().strip()
request=urllib.request.Request('http://127.0.0.1:3153/health',headers={'Authorization':'Bearer '+key})
with urllib.request.urlopen(request,timeout=10) as response:health=json.load(response)
health={k:health.get(k) for k in ['ready','asrRevision','multilingualAsr','asrLanguages','ttsLanguages','recognizerCacheLimit','metrics']}
print(json.dumps({'at':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'unit':unit,'actualProcessThreads':threads,'process':whitelist,'cgroup':cg,'loadAverage':Path('/proc/loadavg').read_text().strip(),'logicalCpuCount':os.cpu_count(),'engineHealth':health,'modelCalls':0,'serviceChanges':0,'personalTranscriptOrAudioRead':False}))
`;
const result=JSON.parse(primary(python({},program)));
await writeFile('artifacts/voice-latency-r19/service-capacity-after.json',JSON.stringify(result,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify(result));
