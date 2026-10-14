/** Bounded syscall metadata for a fixed isolated test cgroup; no read buffers. */
import {remote,lanProfile,python} from './managed-server-client.mjs';
const runId=process.argv[2];
const action=process.argv[3]??'--attach';
if(!['--attach','--start','--read'].includes(action))throw Error('INVALID_DIAGNOSTIC_ACTION');
if(!/^(?:[0-9a-f]{40}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/.test(runId))throw Error('INVALID_RUN');
console.log(remote(lanProfile,'jarvis-101',python({runId,action},String.raw`from pathlib import Path
import json,subprocess,re,signal,os
tracepath=Path('/var/log')/('jarvis-msf-trace-'+p['runId']+'.log')
if p['action']=='--start':
 fd=os.open(tracepath,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600);os.close(fd)
 args=['/usr/bin/systemd-run','--collect','--unit=jarvis-msf-baseline-'+p['runId'],'--property=RuntimeMaxSec=1300','--property=Type=exec','/usr/bin/strace','-f','-qq','-s','200','-e','trace=openat,access,readlink,readlinkat,newfstatat,connect','-o',str(tracepath),'/usr/local/libexec/jarvis-msf-validation','/home/superopen/All-Projects/msf',p['runId']]
 r=subprocess.run(args,capture_output=True,timeout=15)
 if r.returncode:raise RuntimeError('FIXED_TRACE_LAUNCH_FAILED')
 print(json.dumps({'started':True,'runId':p['runId'],'readBuffersCaptured':False,'environmentCaptured':False}));raise SystemExit(0)
if p['action']=='--read':
 if tracepath.is_symlink():raise RuntimeError('FIXED_TRACE_LIMIT')
 size=tracepath.stat().st_size;windows=[]
 with tracepath.open('rb') as f:
  windows.append(f.read(4*1024*1024))
  if size>4*1024*1024:f.seek(max(0,size-4*1024*1024));windows.append(f.read(4*1024*1024))
 lines=b'\n'.join(windows).decode(errors='replace').splitlines();denied=[line[:500] for line in lines if re.search(r'= -1 (EACCES|EPERM)',line)];connect=[line[:500] for line in lines if 'connect(' in line]
 print(json.dumps({'denied':list(dict.fromkeys(denied))[:80],'connect':list(dict.fromkeys(connect))[:20],'observedLines':len(lines),'traceBytes':size,'readBuffersCaptured':False,'environmentCaptured':False}));raise SystemExit(0)
group=Path('/sys/fs/cgroup/system.slice')/('jarvis-msf-baseline-'+p['runId']+'.service')/'cgroup.procs'
selected=[]
if group.exists():
 for raw in group.read_text().splitlines():
  if not raw.isdigit():continue
  proc=Path('/proc')/raw
  try:
   args=(proc/'cmdline').read_bytes().split(bytes([0]))
   if any(b'vitest' in a for a in args):selected.append(int(raw))
  except FileNotFoundError:pass
out={'pids':selected,'readBuffersCaptured':False,'environmentCaptured':False,'denied':[],'connect':[]}
if selected:
 args=['/usr/bin/strace','-f','-qq','-s','200','-e','trace=openat,access,readlink,readlinkat,newfstatat,connect']
 for pid in selected:args+=['-p',str(pid)]
 child=subprocess.Popen(args,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE,text=True)
 try:_,trace=child.communicate(timeout=5)
 except subprocess.TimeoutExpired:
  child.send_signal(signal.SIGINT);_,trace=child.communicate(timeout=5)
 for line in trace.splitlines():
  if re.search(r'= -1 (EACCES|EPERM)',line):out['denied'].append(line[:500])
  if 'connect(' in line:out['connect'].append(line[:500])
 out['denied']=list(dict.fromkeys(out['denied']))[:80];out['connect']=list(dict.fromkeys(out['connect']))[:20];out['observedLines']=len(trace.splitlines())
print(json.dumps(out))
`),true));
