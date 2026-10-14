/** Native Whisper CPU sizing on synthetic audio. Same weights, beam and language auto-detection. */
import {mkdir,writeFile} from 'node:fs/promises';
import {primary,python} from './managed-server-client.mjs';
if(!process.argv.includes('--execute')){console.log(JSON.stringify({prepared:true,productionWrites:0,modelGatewayCalls:0,threads:[2,4],beamSize:5}));process.exit(0);}
const attempt=process.argv.find(a=>a.startsWith('--attempt='))?.slice(10)??'1';if(!/^[1-9]\d?$/.test(attempt))throw Error('INVALID_ATTEMPT');
const code=String.raw`import io,json,time,urllib.request,subprocess,pathlib,importlib.util,unicodedata,gc,os
from faster_whisper import WhisperModel
pid=subprocess.check_output(['systemctl','show','jarvis-voice.service','--property=MainPID','--value'],text=True).strip()
args=pathlib.Path('/proc/'+pid+'/cmdline').read_bytes().decode().split(chr(0))
root=pathlib.Path(args[args.index('--multilingual-models')+1]) if '--multilingual-models' in args else pathlib.Path(args[args.index('--models')+1])
module_path=pathlib.Path(next(a for a in args if a.endswith('resident_voice.py')))
spec=importlib.util.spec_from_file_location('jarvis_voice_thread_fixture',module_path);module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
token=pathlib.Path('/var/lib/jarvis/voice-runtime/service-token').read_text().strip();audio=[];results=[]
for language,text,voice in [('en','The moon moves around the Earth because gravity pulls them together.','en-lessac'),('fr','Bonjour. Je voudrais apprendre l’histoire avec vous.','fr-siwis')]:
 request=urllib.request.Request('http://127.0.0.1:3153/v1/audio/speech',data=json.dumps({'model':'piper-resident','language':language,'voice':voice,'input':text,'speed':1}).encode(),headers={'Authorization':'Bearer '+token,'Content-Type':'application/json'})
 with urllib.request.urlopen(request,timeout=15) as response:raw=response.read()
 waveform,seconds=module.decode_audio(raw);waveform,peak,gain=module.prepare_audio(waveform);audio.append((language,text,waveform,seconds))
def normal(text):return ''.join(c for c in unicodedata.normalize('NFKC',text).casefold() if c.isalnum())
def distance(a,b):
 row=list(range(len(b)+1))
 for i,ac in enumerate(a):
  following=[i+1]
  for j,bc in enumerate(b):following.append(min(following[-1]+1,row[j+1]+1,row[j]+(ac!=bc)))
  row=following
 return row[-1]
for threads in [2,4]:
 model=WhisperModel(str(root/'faster-whisper-small'),device='cpu',compute_type='int8',cpu_threads=threads,num_workers=1,local_files_only=True)
 for language,expected,waveform,seconds in audio:
  began=time.monotonic();segments,info=model.transcribe(waveform,language=None,task='transcribe',beam_size=5,temperature=0,vad_filter=False,condition_on_previous_text=False);detection_ms=round((time.monotonic()-began)*1000)
  text=''.join(segment.text for segment in segments).strip();elapsed=round((time.monotonic()-began)*1000);error=distance(normal(expected),normal(text))
  results.append({'inputLanguage':language,'threads':threads,'beamSize':5,'audioSeconds':round(seconds,3),'detectionMs':detection_ms,'totalInferenceMs':elapsed,'detectedLanguage':info.language,'languageProbability':round(info.language_probability,4),'expectedCharacterCount':len(normal(expected)),'recognizedCharacterCount':len(normal(text)),'characterEdits':error,'matchesExpected':error==0})
 del model;gc.collect()
print(json.dumps({'results':results,'logicalCPUs':os.cpu_count(),'existingServiceThreads':args[args.index('--threads')+1] if '--threads' in args else 'default','sameWeights':True,'sameBeamSize':True,'automaticLanguage':True,'productionConfigWrites':0,'serviceRestart':False,'modelGatewayCalls':0,'rawAudioOrPrivateTranscriptRetained':False}))`;
const startedAt=new Date().toISOString();let report;
try{report=JSON.parse(primary(python({code},`import subprocess,pathlib
pid=subprocess.check_output(['systemctl','show','jarvis-voice.service','--property=MainPID','--value'],text=True).strip()
runtime_python=pathlib.Path('/proc/'+pid+'/cmdline').read_bytes().decode().split(chr(0))[0]
if not (runtime_python.startswith('/opt/jarvis/') or runtime_python.startswith('/var/lib/jarvis/voice-staging-')) or 'python' not in pathlib.Path(runtime_python).name:raise RuntimeError('VOICE_RUNTIME_INTERPRETER_SCOPE_INVALID')
r=subprocess.run(['nice','-n','10',runtime_python,'-c',p['code']],capture_output=True,text=True,timeout=42)
if r.returncode:
 import re,json
 codes=re.findall(r'^([A-Za-z]+(?:Error|Exception)):',r.stderr,re.M)
 print(json.dumps({'status':'failed','failure':'ISOLATED_ASR_THREAD_BENCHMARK_FAILED','errorClass':codes[-1] if codes else 'unknown','productionConfigWrites':0,'modelGatewayCalls':0,'rawAudioOrPrivateTranscriptRetained':False}))
else:print(r.stdout)
`)));}catch{report={status:'failed',failure:'ISOLATED_ASR_THREAD_BENCHMARK_FAILED',productionConfigWrites:0,modelGatewayCalls:0,rawAudioOrPrivateTranscriptRetained:false};process.exitCode=1;}
if(report.status==='failed')process.exitCode=1;
await mkdir('artifacts/voice-latency-r19',{recursive:true});await writeFile('artifacts/voice-latency-r19/asr-threads'+(attempt==='1'?'':'-attempt'+attempt)+'.json',JSON.stringify({startedAt,completedAt:new Date().toISOString(),...report},null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(report));
