"""Offline synthetic/official-public fixtures. No family recording, playback, Pi or production DB."""
import io,json,os,secrets,subprocess,time,urllib.request,urllib.error,wave
from pathlib import Path

ROOT=Path('/var/lib/jarvis/voice-staging-20261010-multilingual')
PORT=3156
TOKEN=secrets.token_urlsafe(48)
TOKEN_FILE=ROOT/'fixture-token'
REPORT=ROOT/'fixture-report.json'
STATUS=ROOT/'fixture-status.json'
def status(**value):
 temporary=STATUS.with_suffix('.partial');temporary.write_text(json.dumps(value));temporary.chmod(0o600);temporary.replace(STATUS)
def request(path,data=None,mime='application/json',timeout=150):
 req=urllib.request.Request('http://127.0.0.1:'+str(PORT)+path,data=data,headers={'Authorization':'Bearer '+TOKEN,'Content-Type':mime})
 with urllib.request.urlopen(req,timeout=timeout) as response:return response.read()
def tts(language,text):
 payload={'model':'piper-resident','voice':{'en':'en-lessac','fr':'fr-siwis','de':'de-thorsten'}[language],'language':language,'input':text,'response_format':'wav'}
 start=time.monotonic();raw=request('/v1/audio/speech',json.dumps(payload).encode());elapsed=time.monotonic()-start
 with wave.open(io.BytesIO(raw)) as audio:seconds=audio.getnframes()/audio.getframerate();rate=audio.getframerate()
 assert seconds>0 and rate>0
 return raw,{'ttsMs':round(elapsed*1000),'audioSeconds':round(seconds,2),'sampleRate':rate,'bytes':len(raw)}
def asr(raw,language,wake=None):
 boundary='fixed-fixture-boundary';body=('--'+boundary+'\r\nContent-Disposition: form-data; name="file"; filename="fixture.wav"\r\nContent-Type: audio/wav\r\n\r\n').encode()+raw+b'\r\n'
 for name,value in [('language',language),*([('wake_word',wake)] if wake else [])]:body+=('--'+boundary+'\r\nContent-Disposition: form-data; name="'+name+'"\r\n\r\n'+value+'\r\n').encode()
 body+=('--'+boundary+'--\r\n').encode();start=time.monotonic();result=json.loads(request('/v1/audio/transcriptions',body,'multipart/form-data; boundary='+boundary));result['elapsedMs']=round((time.monotonic()-start)*1000);return result
def silence():
 output=io.BytesIO()
 with wave.open(output,'wb') as audio:audio.setnchannels(1);audio.setsampwidth(2);audio.setframerate(16000);audio.writeframes(bytes(64000))
 return output.getvalue()
def expected_error(payload,code):
 try:request('/v1/audio/speech',json.dumps(payload).encode())
 except urllib.error.HTTPError as error:assert error.code==422;actual=json.load(error);assert actual['code']==code;return code
 raise AssertionError('Expected failure was not returned')
def memory(pid):
 values={}
 for line in Path('/proc/'+str(pid)+'/status').read_text().splitlines():
  if line.startswith(('VmRSS:','VmHWM:','Threads:')):values[line.split(':')[0]]=line.split(':')[1].strip()
 return values

status(state='running',startedAt=time.time())
TOKEN_FILE.write_text(TOKEN);TOKEN_FILE.chmod(0o600)
process=None
try:
 env={**os.environ,'OMP_NUM_THREADS':'2','OPENBLAS_NUM_THREADS':'2','HF_HUB_OFFLINE':'1','TRANSFORMERS_OFFLINE':'1'}
 log=(ROOT/'fixture-worker.log').open('w');os.chmod(ROOT/'fixture-worker.log',0o600)
 process=subprocess.Popen([str(ROOT/'venv/bin/python'),str(ROOT/'resident_voice.py'),'--models','/var/lib/jarvis/voice-models','--multilingual-models',str(ROOT/'models'),'--token-file',str(TOKEN_FILE),'--port',str(PORT),'--threads','2'],stdin=subprocess.DEVNULL,stdout=log,stderr=log,env=env)
 deadline=time.monotonic()+90;health=None
 while time.monotonic()<deadline:
  if process.poll() is not None:raise RuntimeError('STAGING_WORKER_START_FAILED')
  try:health=json.loads(request('/health',timeout=2));break
  except Exception:time.sleep(.5)
 assert health and health['ready'] is True and set(health['piperLanguages'])=={'en','fr','de'}
 assert set(['zh','en','fr','de','auto']).issubset(health['asrLanguages'])
 samples=[]
 for language,text in [('en','Hello, Jarvis. Please tell me about the history of London.'),('fr','Bonjour. Je voudrais pratiquer le français avec vous.'),('de','Guten Tag. Ich möchte mit Ihnen Deutsch lernen.')]:
  raw,tts_info=tts(language,text);recognized=asr(raw,language);automatic=asr(raw,'auto');assert recognized['language']==language and recognized['text'].strip();assert automatic['language']==language
  warm,tts_warm=tts(language,text)
  samples.append({'source':'synthetic-native-language-roundtrip','language':language,'reference':text,'recognition':recognized,'automatic':automatic,'ttsCold':tts_info,'ttsWarm':tts_warm})
 human=Path('/var/lib/jarvis/voice-models/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2025-09-09/test_wavs/en.wav').read_bytes()
 human_result=asr(human,'en');human_auto=asr(human,'auto');assert human_result['language']=='en' and human_auto['language']=='en'
 samples.append({'source':'official-human-English-public-sample','language':'en','reference':'the tribal chieftain called for the boy and presented him with fifty pieces of gold','recognition':human_result,'automatic':human_auto,'previousSenseVoiceText':'THE TRIVBAL CHIEF THIN CALLED FOR THE BOY AND PRESENTED HIM WITH FIFTY PIECES OF COOD'})
 payload={'model':'matcha-resident','voice':'0','language':'zh','input':'请检查书房服务器的运行状态。','response_format':'wav'};chinese=request('/v1/audio/speech',json.dumps(payload).encode());zh=asr(chinese,'zh');assert zh['language']=='zh' and '服务器' in zh['text']
 zh_auto=asr(chinese,'auto');assert zh_auto['language']=='zh' and zh_auto['model']=='sensevoice-resident' and '服务器' in zh_auto['text'];assert zh_auto['languageProbability']>=.5
 no_speech=asr(silence(),'auto');assert no_speech['noSpeech'] is True and no_speech['text']==''
 no_wake=asr(chinese,'zh','贾维斯');assert no_wake['wakeDetected'] is False and no_wake['recognitionSkipped'] is True and no_wake['text']==''
 errors=[expected_error({'model':'kokoro-resident','voice':'58','language':'fr','input':'Bonjour.'},'TTS_LANGUAGE_UNSUPPORTED'),expected_error({'model':'piper-resident','voice':'en-lessac','language':'fr','input':'Bonjour.'},'VOICE_LANGUAGE_MISMATCH'),expected_error({'model':'piper-resident','voice':'fr-siwis','language':'auto','input':'Bonjour.'},'TTS_LANGUAGE_REQUIRED')]
 result={'state':'passed','revision':health['asrRevision'],'testPort':PORT,'effectiveUser':os.geteuid(),'health':health,'samples':samples,'chinese':zh,'chineseAutomatic':zh_auto,'silence':no_speech,'sleepingRoom':no_wake,'expectedFailures':errors,'resources':memory(process.pid),'humanFrenchGermanAccuracyMeasured':False,'physicalMicrophone':False,'physicalSpeaker':False,'paidModels':False,'productionChanged':False}
 REPORT.write_text(json.dumps(result,ensure_ascii=False,indent=2));REPORT.chmod(0o600);status(state='complete',exitCode=0,completedAt=time.time())
except Exception as error:
 # Only a fixed fixture error code; no service credential or arbitrary response body.
 status(state='failed',errorType=type(error).__name__,exitCode=1,completedAt=time.time());raise
finally:
 if process:
  process.terminate()
  try:process.wait(timeout=10)
  except subprocess.TimeoutExpired:process.kill();process.wait()
 TOKEN_FILE.unlink(missing_ok=True)
