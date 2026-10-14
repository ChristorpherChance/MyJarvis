/** Exactly two public synthetic ASR fixtures. No conversation or gateway model call. */
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {remote,lanProfile,python} from './managed-server-client.mjs';
const folder='artifacts/voice-latency-r19';
if(!process.argv.includes('--execute')){console.log(JSON.stringify({prepared:true,localAsrRequests:2,localTtsRequests:2,gatewayModelRequests:0,serviceChanges:0}));process.exit(0);}
const [quota,before,after]=await Promise.all(['quota-adjustment.json','before-attempt4.json','after.json'].map(async name=>JSON.parse(await readFile(folder+'/'+name,'utf8'))));
assert(quota.status==='verified'&&quota.result?.deployed&&quota.result.actualProcessThreads===4,'QUOTA_NOT_VERIFIED');
const program=String.raw`import urllib.request,time,re,unicodedata,io,wave,sqlite3,subprocess,hashlib
from pathlib import Path
UNIT='jarvis-voice.service'
def unit():
 r=subprocess.run(['systemctl','show',UNIT,'--property=ActiveState,MainPID,ControlGroup,CPUQuotaPerSecUSec'],capture_output=True,text=True,check=True,timeout=10)
 return dict(x.split('=',1) for x in r.stdout.splitlines() if '=' in x)
u=unit()
if u.get('ActiveState')!='active' or u.get('ControlGroup')!='/system.slice/'+UNIT:raise RuntimeError('ASR_QUOTA_UNIT_STATE_CHANGED')
args=(Path('/proc')/u['MainPID']/'cmdline').read_bytes().split(b'\0')
if args.count(b'--threads')!=1 or args[args.index(b'--threads')+1]!=b'4':raise RuntimeError('ASR_QUOTA_WORKER_THREADS_CHANGED')
base=Path('/sys/fs/cgroup')/u['ControlGroup'].lstrip('/')
cpu_max=(base/'cpu.max').read_text().strip();maximum,period=map(int,cpu_max.split())
if maximum/period!=4:raise RuntimeError('ASR_QUOTA_EFFECTIVE_LIMIT_CHANGED')
if hashlib.sha256(Path('/etc/systemd/system/jarvis-voice.service').read_bytes()).hexdigest()!=p['unitSHA256']:raise RuntimeError('ASR_QUOTA_SOURCE_CAS_CHANGED')
c=sqlite3.connect('file:/var/lib/jarvis/data/jarvis.db?mode=ro',uri=True)
try:
 if c.execute("SELECT count(*) FROM runtime_voice_jobs WHERE status IN ('queued','running')").fetchone()[0]:raise RuntimeError('ASR_QUOTA_VOICE_JOBS_ACTIVE')
finally:c.close()
key=Path('/var/lib/jarvis/voice-runtime/service-token').read_text().strip();headers={'Authorization':'Bearer '+key};origin='http://127.0.0.1:3153'
def get_health():
 with urllib.request.urlopen(urllib.request.Request(origin+'/health',headers=headers),timeout=5) as response:return json.load(response)
health=get_health();initial_calls=health.get('metrics',{}).get('asr',{}).get('calls')
if health.get('ready') is not True or initial_calls!=0:raise RuntimeError('ASR_QUOTA_FRESH_WORKER_REQUIRED')
def cpu_stat():return dict(line.split() for line in (base/'cpu.stat').read_text().splitlines())
def clean(text):return ''.join(x for x in unicodedata.normalize('NFKC',text).lower() if unicodedata.category(x)[0] in 'LN')
def distance(a,b):
 row=list(range(len(b)+1))
 for i,x in enumerate(a,1):
  nxt=[i]
  for j,y in enumerate(b,1):nxt.append(min(nxt[-1]+1,row[j]+1,row[j-1]+(x!=y)))
  row=nxt
 return row[-1]
stat_before=cpu_stat();samples=[]
fixtures=[{'id':'zh-gravity','language':'zh','text':'简单解释一下重力，用两句短句回答。'},{'id':'en-gravity','language':'en','text':'Explain gravity in two short sentences.'}]
for fixture in fixtures:
 payload=json.dumps({'input':fixture['text'],'language':fixture['language'],'model':'matcha-resident' if fixture['language']=='zh' else 'piper-resident','voice':'0' if fixture['language']=='zh' else 'en-lessac','speed':1,'response_format':'wav'}).encode()
 req=urllib.request.Request(origin+'/v1/audio/speech',data=payload,headers={**headers,'Content-Type':'application/json'})
 with urllib.request.urlopen(req,timeout=30) as response:audio=response.read()
 with wave.open(io.BytesIO(audio),'rb') as wav:audio_seconds=wav.getnframes()/wav.getframerate();sample_rate=wav.getframerate()
 boundary='jarvis-quota-r19-'+fixture['id'];body=('--'+boundary+'\r\nContent-Disposition: form-data; name="file"; filename="synthetic.wav"\r\nContent-Type: audio/wav\r\n\r\n').encode()+audio+('\r\n--'+boundary+'--\r\n').encode()
 req=urllib.request.Request(origin+'/v1/audio/transcriptions',data=body,headers={**headers,'Content-Type':'multipart/form-data; boundary='+boundary})
 started=time.monotonic()
 with urllib.request.urlopen(req,timeout=30) as response:recognized=json.load(response)
 elapsed=round((time.monotonic()-started)*1000);expected=clean(fixture['text']);actual=clean(recognized.get('text',''))
 if recognized.get('language')!=fixture['language'] or recognized.get('noSpeech'):raise RuntimeError('ASR_QUOTA_LANGUAGE_OR_SPEECH_FAILED')
 samples.append({'fixture':fixture['id'],'inputLanguage':fixture['language'],'detectedLanguage':recognized.get('language'),'asrModel':recognized.get('model'),'asrInferenceMs':recognized.get('inferenceMs'),'serverHttpRoundTripMs':elapsed,'actualAudioSeconds':round(audio_seconds,6),'waveSampleRate':sample_rate,'expectedNormalizedChars':len(expected),'recognizedNormalizedChars':len(actual),'normalizedEditDistance':distance(expected,actual),'asrRequestPositionSinceRestart':len(samples)+1})
stat_after=cpu_stat();health_after=get_health()
print(json.dumps({'at':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'unit':UNIT,'unitSHA256':p['unitSHA256'],'effectiveCpuMax':cpu_max,'actualWorkerThreads':4,'systemdQuota':u.get('CPUQuotaPerSecUSec'),'asrRevision':health.get('asrRevision'),'initialAsrCalls':initial_calls,'finalAsrCalls':health_after.get('metrics',{}).get('asr',{}).get('calls'),'samples':samples,'throttleDelta':{name:int(stat_after.get(name,0))-int(stat_before.get(name,0)) for name in ['nr_periods','nr_throttled','throttled_usec']},'gatewayModelRequests':0,'localAsrRequests':len(samples),'localTtsRequests':len(samples),'configurationWrites':0,'physicalMicrophoneOrSpeaker':False,'privateTranscriptOrAudioRetained':False,'status':'passed'}))
`;
let report;
try{
 const result=JSON.parse(remote(lanProfile,'jarvis-112',python({unitSHA256:quota.result.afterSHA256},program),true,{timeoutMs:90000}));
 const compare=(baseline,current)=>({beforeMs:baseline,afterMs:current,changePercent:Math.round((current-baseline)/baseline*10000)/100,convention:'negative change means faster'});
 report={...result,throttleDeltaScope:'Both local fixture TTS generation and ASR requests; not ASR CPU alone',comparisons:result.samples.map(sample=>({fixture:sample.fixture,
  versusR19With250Percent:compare(after.samples.find(x=>x.fixture===sample.fixture).asrInferenceMs,sample.asrInferenceMs),
  versusOriginal2Threads250Percent:compare(before.samples.find(x=>x.fixture===sample.fixture).asrInferenceMs,sample.asrInferenceMs)})),
  productionScopeVerified:result.samples.length===2&&result.samples.every(x=>x.detectedLanguage===x.inputLanguage)&&result.initialAsrCalls===0,
  lexicalFixtureScopeVerified:result.samples.every(x=>x.normalizedEditDistance===0),
  gatewayModelRequests:0,costUSD:0,costScope:'No gateway request in this ASR-only check; existing local CPU runtime used',
  limits:['Two public synthetic phrases only; not general recognition accuracy or phone field acceptance.',
   'Main before-attempt4 Chinese baseline was already warmed by failed attempt3; this check starts at ASR call zero after the controlled quota restart.',
   'R19 after.json Chinese was the first ASR call on its new worker as well; this is a more comparable cold-start sequence, still only one observation.',
   'Only native ASR inference duration is compared. This new server HTTP round trip excludes SSH and is not compared with old asrMs.',
   'Old fixtureAudioSeconds used a 16 kHz byte-length estimate; actualAudioSeconds here reads WAV sample rate. That old approximate duration is not used for any latency comparison.',
   'The 400% quota limits CPU time across shared logical CPUs; it does not allocate or reserve four exclusive cores.',
   'No additional conversation or paid model request was run to improve benchmark results.']};
}catch{
 report={at:new Date().toISOString(),status:'failed-or-unconfirmed',failureCode:'ASR_QUOTA_PROBE_FAILED',gatewayModelRequests:0,configurationWrites:0,phoneFieldAcceptance:false};process.exitCode=1;
}
const references=['quota-adjustment.json','after.json','before-attempt4.json'];report.referenceHashes={};
for(const name of references)report.referenceHashes[name]=createHash('sha256').update(await readFile(folder+'/'+name)).digest('hex');
await writeFile(folder+'/asr-after-quota.json',JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify(report));
