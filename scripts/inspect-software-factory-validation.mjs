import {remote,lanProfile,python} from './managed-server-client.mjs';
const runId=process.argv[2];if(!/^(?:[0-9a-f]{40}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/.test(runId))throw Error('INVALID_RUN');
console.log(remote(lanProfile,'jarvis-101',python({runId},`from pathlib import Path
import json,subprocess,re,os
root=Path('/var/lib/jarvis-development/101/validation')/p['runId'];out={'attempts':[]}
if root.exists():
 for a in sorted(root.glob('attempt-*')):
  if a.is_symlink():continue
  item={'attempt':a.name,'files':[f.name for f in a.iterdir() if f.is_file()]}
  for f in a.glob('*.log'):
   text=f.read_text(errors='replace')[-4000:];item[f.name]=[s[:400] for s in text.splitlines() if re.search('Error|ERR_|denied|ENOENT|EACCES|EPERM|failed',s,re.I)][:10]
  out['attempts'].append(item)
j=subprocess.run(['/usr/bin/journalctl','-u','jarvis-msf-baseline-'+p['runId'],'-n','40','--no-pager','-o','cat'],capture_output=True,text=True,timeout=10)
out['diagnostics']=[s[:400] for s in j.stdout.splitlines() if re.search('Error|ERR_|denied|ENOENT|EACCES|EPERM|failed|at .+:[0-9]',s,re.I)]
group=Path('/sys/fs/cgroup/system.slice')/('jarvis-msf-baseline-'+p['runId']+'.service')/'cgroup.procs'
out['processes']=[]
if group.exists():
 for raw in group.read_text().splitlines():
  if not raw.isdigit():continue
  proc=Path('/proc')/raw
  try:
   args=(proc/'cmdline').read_bytes().split(bytes([0]));args=[a.decode(errors='replace') for a in args if a]
   stat=(proc/'stat').read_text().split();out['processes'].append({'pid':int(raw),'state':stat[2],'cpuTicks':int(stat[13])+int(stat[14]),'command':[x[:180] for x in args[:8]],'wait':(proc/'wchan').read_text().strip()})
  except:pass
print(json.dumps(out))
`),true));
