"""Loopback-only resident CPU speech service. No audio/text logging or runtime downloads."""
import argparse,io,json,hmac,threading,time,wave
from collections import OrderedDict
from email.parser import BytesParser
from email.policy import default
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
from pathlib import Path
import av
import numpy as np
import sherpa_onnx

ASR_NAME='sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2025-09-09'
TTS_NAME='kokoro-int8-multi-lang-v1_1'
KWS_NAME='sherpa-onnx-kws-zipformer-zh-en-3M-2025-12-20'
FAST_TTS_NAME='matcha-icefall-zh-en'
WHISPER_NAME='faster-whisper-small'
PIPER_NAMES={'en':('vits-piper-en_US-lessac-medium','en-lessac'),'fr':('vits-piper-fr_FR-siwis-medium','fr-siwis'),'de':('vits-piper-de_DE-thorsten-medium','de-thorsten')}
ASR_LANGUAGES={'auto','zh','en','fr','de','ja','ko','yue'}
AUTO_LANGUAGES={'zh','en','fr','de'}
ASR_RUNTIME_VERSION='20261010-multilingual-r2'
VAD_NAME='silero_vad.onnx'

def asr_language(value):
 if not isinstance(value,str) or value not in ASR_LANGUAGES:raise ValueError('LANGUAGE_UNSUPPORTED')
 return value

def decode_audio(raw):
 frames=[];duration=0
 converter=av.AudioResampler(format='fltp',layout='mono',rate=16000)
 with av.open(io.BytesIO(raw)) as container:
  for frame in container.decode(audio=0):
   duration+=frame.samples/frame.sample_rate
   if duration>65:raise ValueError('AUDIO_TOO_LONG')
   frames.extend(x.to_ndarray().reshape(-1) for x in converter.resample(frame))
 frames.extend(x.to_ndarray().reshape(-1) for x in converter.resample(None))
 if not frames:raise ValueError('NO_SPEECH')
 return np.concatenate(frames).astype(np.float32,copy=False),duration

def prepare_audio(audio):
 """Remove DC and lift very quiet recordings conservatively; never clip or invent words."""
 if not len(audio) or not np.isfinite(audio).all():raise ValueError('NO_SPEECH')
 centered=audio-float(np.mean(audio));peak=float(np.max(np.abs(centered)))
 gain=min(4.0,.2/peak) if .001<=peak<.2 else 1.0
 return (centered*gain).astype(np.float32,copy=False),peak,gain

def speech_bounds(vad,audio,window=512):
 """One isolated VAD state per utterance; retain pauses and 250 ms edges for ASR."""
 vad.reset();segments=[]
 try:
  padded=np.concatenate((audio,np.zeros(16000,dtype=np.float32)))
  for at in range(0,len(padded),window):
   chunk=padded[at:at+window]
   if len(chunk)<window:chunk=np.pad(chunk,(0,window-len(chunk)))
   vad.accept_waveform(chunk)
   while not vad.empty():
    segment=vad.front;segments.append((segment.start,segment.start+len(segment.samples)));vad.pop()
  vad.flush()
  while not vad.empty():
   segment=vad.front;segments.append((segment.start,segment.start+len(segment.samples)));vad.pop()
  if not segments:return None,0
  first=max(0,min(start for start,end in segments)-4000);last=min(len(audio),max(end for start,end in segments)+4000)
  return audio[first:last],sum(max(0,min(len(audio),end)-start) for start,end in segments)/16000
 finally:vad.reset()

class Engines:
 def __init__(self,root,threads,multilingual_root=None):
  asr=root/ASR_NAME;tts=root/TTS_NAME
  self.asr_options={'model':str(asr/'model.int8.onnx'),'tokens':str(asr/'tokens.txt'),'num_threads':threads,'use_itn':True,'provider':'cpu'}
  self.asr=sherpa_onnx.OfflineRecognizer.from_sense_voice(**self.asr_options,language='auto')
  # Native SenseVoice language is a model config, not a per-stream option.
  # Keep auto plus at most two language-specific instances; serialize all ASR.
  self.asr_languages=OrderedDict()
  config=sherpa_onnx.VadModelConfig();config.silero_vad.model=str(root/VAD_NAME);config.silero_vad.threshold=.35;config.silero_vad.min_speech_duration=.12;config.silero_vad.min_silence_duration=.35;config.silero_vad.max_speech_duration=60;config.sample_rate=16000;config.num_threads=1
  self.vad=sherpa_onnx.VoiceActivityDetector(config,buffer_size_in_seconds=70);self.vad_lock=threading.Lock()
  model=sherpa_onnx.OfflineTtsModelConfig(kokoro=sherpa_onnx.OfflineTtsKokoroModelConfig(model=str(tts/'model.int8.onnx'),voices=str(tts/'voices.bin'),tokens=str(tts/'tokens.txt'),data_dir=str(tts/'espeak-ng-data'),lexicon=','.join(str(tts/x) for x in ['lexicon-us-en.txt','lexicon-zh.txt']),dict_dir=str(tts/'dict')),num_threads=threads,provider='cpu')
  self.tts=sherpa_onnx.OfflineTts(sherpa_onnx.OfflineTtsConfig(model=model,max_num_sentences=1))
  fast=root/FAST_TTS_NAME
  self.fast_tts=sherpa_onnx.OfflineTts(sherpa_onnx.OfflineTtsConfig(model=sherpa_onnx.OfflineTtsModelConfig(matcha=sherpa_onnx.OfflineTtsMatchaModelConfig(acoustic_model=str(fast/'model-steps-3.onnx'),vocoder=str(root/'vocos-16khz-univ.onnx'),lexicon=str(fast/'lexicon.txt'),tokens=str(fast/'tokens.txt'),data_dir=str(fast/'espeak-ng-data')),num_threads=threads),max_num_sentences=1,rule_fsts=','.join(str(fast/x) for x in ['phone-zh.fst','date-zh.fst','number-zh.fst'])))
  multilingual_root=multilingual_root or root
  self.whisper=None;self.piper={}
  whisper_path=multilingual_root/WHISPER_NAME
  if (whisper_path/'model.bin').is_file():
   from faster_whisper import WhisperModel
   self.whisper=WhisperModel(str(whisper_path),device='cpu',compute_type='int8',cpu_threads=threads,num_workers=1,local_files_only=True)
  for language,(name,voice) in PIPER_NAMES.items():
   folder=multilingual_root/name
   if folder.is_dir():
    models=list(folder.glob('*.onnx'))
    if len(models)!=1:raise ValueError('PIPER_MODEL_INVALID')
    config=sherpa_onnx.OfflineTtsModelConfig(vits=sherpa_onnx.OfflineTtsVitsModelConfig(model=str(models[0]),tokens=str(folder/'tokens.txt'),data_dir=str(folder/'espeak-ng-data')),num_threads=threads,provider='cpu')
    self.piper[language]=sherpa_onnx.OfflineTts(sherpa_onnx.OfflineTtsConfig(model=config,max_num_sentences=1))
  kws=root/KWS_NAME
  empty=Path('/var/lib/jarvis/voice-runtime/empty-keywords.txt')
  self.kws=sherpa_onnx.KeywordSpotter(tokens=str(kws/'tokens.txt'),encoder=str(kws/'encoder-epoch-13-avg-2-chunk-8-left-64.int8.onnx'),decoder=str(kws/'decoder-epoch-13-avg-2-chunk-8-left-64.onnx'),joiner=str(kws/'joiner-epoch-13-avg-2-chunk-8-left-64.int8.onnx'),keywords_file=str(empty),num_threads=1,keywords_score=1.5,keywords_threshold=.35)
  self.kws_tokens=str(kws/'tokens.txt');self.kws_lexicon=str(kws/'en.phone')
  self.asr_lock=threading.Lock();self.tts_lock=threading.Lock();self.kws_lock=threading.Lock()
  self.metrics={'asr':{'calls':0},'tts':{'calls':0}}
 def recognizer_for(self,language):
  if language=='auto':return self.asr
  if language in self.asr_languages:self.asr_languages.move_to_end(language);return self.asr_languages[language]
  if len(self.asr_languages)>=2:self.asr_languages.popitem(last=False)
  engine=sherpa_onnx.OfflineRecognizer.from_sense_voice(**self.asr_options,language=language);self.asr_languages[language]=engine
  return engine
 def recognize(self,raw,wake_word='',language='auto'):
  language=asr_language(language);audio,seconds=decode_audio(raw);start=time.monotonic();audio,peak,gain=prepare_audio(audio)
  with self.vad_lock:audio,voiced_seconds=speech_bounds(self.vad,audio)
  if audio is None:
   return {'text':'','language':language,'duration':seconds,'noSpeech':True,'recognitionSkipped':True,**({'wakeDetected':False,'wakeWord':wake_word} if wake_word else {})}
  wake_detected=False;wake_supported=True
  if wake_word:
   import re
   if not re.fullmatch(r'[\u4e00-\u9fffA-Za-z -]{2,32}',wake_word):wake_supported=False
   else:
    with self.kws_lock:
     words=' '.join(re.findall(r'[\u4e00-\u9fff]+|[A-Za-z]+',wake_word));words=re.sub('[A-Za-z]+',lambda m:m.group().upper(),words)
     encoded=sherpa_onnx.text2token([words],tokens=self.kws_tokens,tokens_type='phone+ppinyin',lexicon=self.kws_lexicon)
     if not encoded:wake_supported=False
     else:
      stream=self.kws.create_stream(' '.join(encoded[0])+' @'+wake_word.replace(' ','_'))
      stream.accept_waveform(16000,audio);stream.accept_waveform(16000,np.zeros(10600,dtype=np.float32));stream.input_finished()
      while self.kws.is_ready(stream):
       self.kws.decode_stream(stream)
       if self.kws.get_result(stream)==wake_word.replace(' ','_'):wake_detected=True;break
   # Sleeping-room speech is inspected for the keyword only; do not transcribe it.
   if wake_supported and not wake_detected:return {'text':'','language':language,'duration':seconds,'wakeDetected':False,'wakeWord':wake_word,'recognitionSkipped':True,'inferenceMs':round((time.monotonic()-start)*1000)}
  probability=None;selected_language=language;model='sensevoice-resident';automatic_segments=None
  with self.asr_lock:
   if language=='auto':
    if self.whisper is None:raise ValueError('MULTILINGUAL_ASR_UNAVAILABLE')
    # The upstream automatic path returns the detected language before its lazy
    # segment iterator is consumed. Never decode an unknown language.
    automatic_segments,info=self.whisper.transcribe(audio,language=None,task='transcribe',beam_size=5,temperature=0,vad_filter=False,condition_on_previous_text=False)
    selected_language=info.language;probability=info.language_probability
    if selected_language not in AUTO_LANGUAGES:raise ValueError('LANGUAGE_UNSUPPORTED')
    if probability<.5:raise ValueError('LANGUAGE_UNCERTAIN')
   if selected_language in {'en','fr','de'}:
    if self.whisper is None:raise ValueError('MULTILINGUAL_ASR_UNAVAILABLE')
    if automatic_segments is not None:segments=automatic_segments
    else:segments,info=self.whisper.transcribe(audio,language=selected_language,task='transcribe',beam_size=5,temperature=0,vad_filter=False,condition_on_previous_text=False)
    text=''.join(segment.text for segment in segments).strip();model='whisper-small-resident'
   else:
    recognizer=self.recognizer_for(selected_language);stream=recognizer.create_stream();stream.accept_waveform(16000,audio);recognizer.decode_stream(stream)
    text=stream.result.text.strip()
  elapsed=time.monotonic()-start;self.metrics['asr']={'calls':self.metrics['asr']['calls']+1,'lastInferenceMs':round(elapsed*1000),'lastAudioSeconds':round(seconds,2),'lastDetectedSpeechSeconds':round(voiced_seconds,2),'lastInputPeak':round(peak,4),'lastInputGain':round(gain,2)}
  return {'text':text,'language':selected_language,'model':model,'duration':seconds,'inferenceMs':round(elapsed*1000),**({'languageProbability':round(float(probability),4),'languageUncertain':probability<.7} if probability is not None else {}),**({'wakeDetected':wake_detected,'wakeWord':wake_word} if wake_word else {})}
 def synthesize(self,data):
  text=data.get('input');voice=str(data.get('voice','58'));speed=data.get('speed',1)
  if not isinstance(text,str) or not 1<=len(text.strip())<=1200:raise ValueError('TEXT_LIMIT')
  if data.get('response_format','wav')!='wav':raise ValueError('FORMAT_UNSUPPORTED')
  selected_model=data.get('model','kokoro-resident');language=data.get('language','zh')
  if language=='auto':
   import re
   if re.search(r'[\u4e00-\u9fff]',text):language='zh'
   else:raise ValueError('TTS_LANGUAGE_REQUIRED')
  fast=selected_model=='matcha-resident'
  if selected_model=='piper-resident':
   if language not in PIPER_NAMES:raise ValueError('TTS_LANGUAGE_UNSUPPORTED')
   if voice!=PIPER_NAMES[language][1]:raise ValueError('VOICE_LANGUAGE_MISMATCH')
   if language not in self.piper:raise ValueError('MULTILINGUAL_TTS_UNAVAILABLE')
   engine=self.piper[language];sid=0
  else:
   if selected_model not in {'matcha-resident','kokoro-resident'}:raise ValueError('MODEL_UNSUPPORTED')
   if language not in {'zh','en'}:raise ValueError('TTS_LANGUAGE_UNSUPPORTED')
   if not voice.isdigit() or not 0<=int(voice)<(1 if fast else 103):raise ValueError('VOICE_INVALID')
   engine=self.fast_tts if fast else self.tts;sid=int(voice)
  if not isinstance(speed,(float,int)) or not .5<=speed<=2:raise ValueError('SPEED_INVALID')
  start=time.monotonic()
  with self.tts_lock:audio=engine.generate(text,sid=sid,speed=speed)
  samples=(np.clip(audio.samples,-1,1)*32767).astype('<i2')
  if len(samples)/audio.sample_rate>180:raise ValueError('OUTPUT_LIMIT')
  buffer=io.BytesIO()
  with wave.open(buffer,'wb') as output:output.setnchannels(1);output.setsampwidth(2);output.setframerate(audio.sample_rate);output.writeframes(samples.tobytes())
  elapsed=time.monotonic()-start
  self.metrics['tts']={'calls':self.metrics['tts']['calls']+1,'lastInferenceMs':round(elapsed*1000),'lastAudioSeconds':round(len(samples)/audio.sample_rate,2)}
  return buffer.getvalue()

class Server(ThreadingHTTPServer):
 daemon_threads=True;request_queue_size=4
 def __init__(self,address,engines,token):
  self.engines=engines;self.token=token;self.slots=threading.BoundedSemaphore(4);super().__init__(address,Handler)
 def process_request(self,request,address):
  if not self.slots.acquire(False):request.close();return
  super().process_request(request,address)
 def process_request_thread(self,request,address):
  try:super().process_request_thread(request,address)
  finally:self.slots.release()

class Handler(BaseHTTPRequestHandler):
 def setup(self):super().setup();self.connection.settimeout(15)
 def log_message(self,*args):pass
 def send(self,status,payload,mime='application/json'):
  raw=json.dumps(payload,ensure_ascii=False).encode() if not isinstance(payload,bytes) else payload
  self.send_response(status);self.send_header('Content-Type',mime);self.send_header('Content-Length',str(len(raw)));self.send_header('Cache-Control','no-store');self.end_headers();self.wfile.write(raw)
 def authenticated(self):return hmac.compare_digest(self.headers.get('Authorization',''),'Bearer '+self.server.token)
 def do_GET(self):
  if not self.authenticated():self.send(401,{'code':'UNAUTHORIZED'});return
  if self.path!='/health':self.send(404,{'code':'NOT_FOUND'});return
  engines=self.server.engines
  self.send(200,{'ready':True,'runtime':sherpa_onnx.__version__,'asr':ASR_NAME,'tts':TTS_NAME,'fastTts':FAST_TTS_NAME,'kws':KWS_NAME,'voices':103+len(engines.piper),'multilingualAsr':WHISPER_NAME if engines.whisper is not None else None,'asrLanguages':['zh','ja','ko','yue']+(['en','fr','de','auto'] if engines.whisper is not None else []),'ttsLanguages':['zh','en']+sorted(language for language in engines.piper if language not in {'zh','en'}),'piperLanguages':sorted(engines.piper),'asrRevision':ASR_RUNTIME_VERSION,'languageSelection':'explicit-or-whisper-detection-no-translation','recognizerCacheLimit':3,'speechDetection':'silero-local','inputPreparation':'dc-remove-bounded-gain-4x','metrics':engines.metrics})
 def do_POST(self):
  if not self.authenticated():self.send(401,{'code':'UNAUTHORIZED'});return
  try:
   length=int(self.headers.get('Content-Length','0'))
   if not 0<length<=25*1024*1024:raise ValueError('BODY_LIMIT')
   raw=self.rfile.read(length)
   if len(raw)!=length:raise ValueError('BODY_INCOMPLETE')
   if self.path=='/v1/audio/transcriptions':
    content_type=self.headers.get('Content-Type','')
    if not content_type.startswith('multipart/form-data;'):raise ValueError('FORMAT_INVALID')
    message=BytesParser(policy=default).parsebytes(('Content-Type: '+content_type+'\r\nMIME-Version: 1.0\r\n\r\n').encode()+raw)
    files=[part.get_payload(decode=True) for part in message.iter_parts() if part.get_param('name',header='content-disposition')=='file']
    if len(files)!=1:raise ValueError('FILE_INVALID')
    fields={part.get_param('name',header='content-disposition'):part.get_payload(decode=True) for part in message.iter_parts() if part.get_param('name',header='content-disposition')!='file'}
    wake=fields.get('wake_word',b'').decode('utf-8');language=fields.get('language',b'auto').decode('utf-8')
    self.send(200,self.server.engines.recognize(files[0],wake,language))
   elif self.path=='/v1/audio/speech':self.send(200,self.server.engines.synthesize(json.loads(raw)),'audio/wav')
   else:self.send(404,{'code':'NOT_FOUND'})
  except (BrokenPipeError,ConnectionResetError):pass
  except ValueError as error:self.send(422,{'code':str(error) if str(error) in {'AUDIO_TOO_LONG','NO_SPEECH','TEXT_LIMIT','FORMAT_UNSUPPORTED','VOICE_INVALID','SPEED_INVALID','OUTPUT_LIMIT','BODY_LIMIT','BODY_INCOMPLETE','FORMAT_INVALID','FILE_INVALID','LANGUAGE_UNSUPPORTED','LANGUAGE_UNCERTAIN','MULTILINGUAL_ASR_UNAVAILABLE','MULTILINGUAL_TTS_UNAVAILABLE','TTS_LANGUAGE_REQUIRED','TTS_LANGUAGE_UNSUPPORTED','VOICE_LANGUAGE_MISMATCH','MODEL_UNSUPPORTED'} else 'INVALID_INPUT'})
  except Exception:self.send(500,{'code':'ENGINE_FAILED'})

if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('--models',type=Path,required=True);parser.add_argument('--multilingual-models',type=Path);parser.add_argument('--token-file',type=Path,required=True);parser.add_argument('--port',type=int,default=3153);parser.add_argument('--threads',type=int,choices=[1,2,3,4],default=2);args=parser.parse_args()
 engines=Engines(args.models,args.threads,args.multilingual_models);token=args.token_file.read_text().strip()
 if len(token)<40:raise SystemExit('Invalid private service credential')
 print(json.dumps({'ready':True,'port':args.port}),flush=True)
 # Native phonemizer diagnostics can contain the spoken text. Do not retain them.
 import os
 with open(os.devnull,'w') as sink:os.dup2(sink.fileno(),1);os.dup2(sink.fileno(),2)
 Server(('127.0.0.1',args.port),engines,token).serve_forever()
