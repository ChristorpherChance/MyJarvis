"""Model-free regression tests for language selection, cache bounds, and HTTP fields."""
import importlib.util,json,threading,time,types,unittest,urllib.request,urllib.error
from pathlib import Path
from unittest.mock import patch

created=[]
class Stream:
 def __init__(self):self.result=types.SimpleNamespace(text='');self.samples=None
 def accept_waveform(self,rate,audio):self.samples=audio
class Recognizer:
 def __init__(self,language):self.language=language;created.append(language)
 def create_stream(self):return Stream()
 def decode_stream(self,stream):time.sleep(.002);stream.result.text=self.language
native=types.SimpleNamespace(OfflineRecognizer=types.SimpleNamespace(from_sense_voice=lambda **args:Recognizer(args['language'])),text2token=lambda *args,**kwargs:['fake-keyword'])
spec=importlib.util.spec_from_file_location('resident_voice_test',Path(__file__).resolve().parents[1]/'apps/api/resources/voice/resident_voice.py');voice=importlib.util.module_from_spec(spec)
with patch.dict('sys.modules',{'av':types.ModuleType('av'),'numpy':types.SimpleNamespace(zeros=lambda *args,**kwargs:[],float32=float),'sherpa_onnx':native}):spec.loader.exec_module(voice)

def fixture():
 e=voice.Engines.__new__(voice.Engines);e.asr_options={};e.asr=Recognizer('auto');e.asr_languages=voice.OrderedDict();e.asr_lock=threading.Lock();e.kws_lock=threading.Lock();e.vad_lock=threading.Lock();e.vad=object();e.metrics={'asr':{'calls':0},'tts':{'calls':0}};e.whisper=types.SimpleNamespace(transcribe=lambda audio,**options:([types.SimpleNamespace(text=options['language'] or 'en')],types.SimpleNamespace(language=options['language'] or 'en',language_probability=.9)));return e
class Tests(unittest.TestCase):
 def setUp(self):
  created.clear();audio=patch.object(voice,'prepare_audio',side_effect=lambda a:(a,.02,1));bounds=patch.object(voice,'speech_bounds',side_effect=lambda v,a:(a,.5));audio.start();bounds.start();self.addCleanup(audio.stop);self.addCleanup(bounds.stop)
 def test_no_speech_skips_asr_and_does_not_invent_text(self):
  e=fixture()
  with patch.object(voice,'decode_audio',return_value=([0],.5)),patch.object(voice,'speech_bounds',return_value=(None,0)):
   result=e.recognize(b'x',language='zh');wake=e.recognize(b'x','贾维斯','zh')
  self.assertTrue(result['noSpeech']);self.assertEqual(result['text'],'');self.assertFalse(wake['wakeDetected']);self.assertEqual(created,['auto']);self.assertEqual(e.metrics['asr']['calls'],0)
 def test_cache_is_bounded_and_language_does_not_leak(self):
  e=fixture();auto=e.asr
  for lang in ['zh','en','zh','ja','zh']:self.assertEqual(e.recognizer_for(lang).language,lang)
  self.assertEqual(created,['auto','zh','en','ja']);self.assertEqual(list(e.asr_languages),['ja','zh']);self.assertIs(e.recognizer_for('auto'),auto)
 def test_concurrent_requests_get_their_own_language(self):
  e=fixture();results={}
  def run(lang):results[lang]=e.recognize(b'own-audio',language=lang)
  with patch.object(voice,'decode_audio',return_value=([.02],.5)):
   workers=[threading.Thread(target=run,args=(lang,)) for lang in ['zh','en']]
   for worker in workers:worker.start()
   for worker in workers:worker.join()
  for lang in ['zh','en']:self.assertEqual(results[lang]['language'],lang);self.assertEqual(results[lang]['text'],lang)
  self.assertEqual(e.metrics['asr']['calls'],2)
 def test_unsupported_language_is_rejected_before_audio_decoding(self):
  e=fixture()
  with patch.object(voice,'decode_audio') as decode:
   with self.assertRaisesRegex(ValueError,'LANGUAGE_UNSUPPORTED'):e.recognize(b'x',language='es')
   decode.assert_not_called()
 def test_negative_wake_still_skips_transcription(self):
  e=fixture();e.kws_tokens='fixture';e.kws_lexicon='fixture';e.kws=types.SimpleNamespace(create_stream=lambda *args:types.SimpleNamespace(accept_waveform=lambda *args:None,input_finished=lambda:None),is_ready=lambda s:False)
  with patch.object(voice,'decode_audio',return_value=([.02],.5)):result=e.recognize(b'x','贾维斯','zh')
  self.assertEqual(result['text'],'');self.assertEqual(result['language'],'zh');self.assertTrue(result['recognitionSkipped']);self.assertEqual(created,['auto']);self.assertEqual(e.metrics['asr']['calls'],0)
 def test_http_multipart_language_is_forwarded_and_default_is_auto(self):
  calls=[]
  def recognize(raw,wake,language):calls.append((raw,wake,language));voice.asr_language(language);return {'text':'fixture','language':language}
  server=voice.Server(('127.0.0.1',0),types.SimpleNamespace(recognize=recognize),'test-service-only');worker=threading.Thread(target=server.serve_forever,daemon=True);worker.start()
  try:
   for requested in ['zh','en',None,'es']:
    boundary='jarvis-test-boundary';parts=[b'--'+boundary.encode()+b'\r\nContent-Disposition: form-data; name="file"; filename="audio.wav"\r\nContent-Type: audio/wav\r\n\r\nfixture-audio\r\n']
    if requested:parts.append(('--'+boundary+'\r\nContent-Disposition: form-data; name="language"\r\n\r\n'+requested+'\r\n').encode())
    body=b''.join(parts)+('--'+boundary+'--\r\n').encode();request=urllib.request.Request('http://127.0.0.1:'+str(server.server_port)+'/v1/audio/transcriptions',data=body,headers={'Authorization':'Bearer test-service-only','Content-Type':'multipart/form-data; boundary='+boundary})
    if requested=='es':
     with self.assertRaises(urllib.error.HTTPError) as error:urllib.request.urlopen(request)
     self.assertEqual(error.exception.code,422);self.assertEqual(json.load(error.exception)['code'],'LANGUAGE_UNSUPPORTED')
    else:
     with urllib.request.urlopen(request) as response:self.assertEqual(json.load(response)['language'],requested or 'auto')
   self.assertEqual([c[2] for c in calls],['zh','en','auto','es']);self.assertTrue(all(c[0]==b'fixture-audio' for c in calls))
  finally:server.shutdown();server.server_close();worker.join()
 def test_new_languages_use_whisper_and_report_actual_model(self):
  e=fixture()
  with patch.object(voice,'decode_audio',return_value=([.02],.5)):
   for lang in ['en','fr','de']:
    result=e.recognize(b'fixture',language=lang);self.assertEqual(result['text'],lang);self.assertEqual(result['model'],'whisper-small-resident')
   result=e.recognize(b'fixture',language='auto');self.assertEqual(result['language'],'en');self.assertEqual(result['languageProbability'],.9)
  self.assertEqual(created,['auto'])
 def test_auto_does_not_guess_unsupported_or_uncertain_language(self):
  e=fixture()
  with patch.object(voice,'decode_audio',return_value=([.02],.5)):
   for lang,probability,code in [('es',.99,'LANGUAGE_UNSUPPORTED'),('fr',.2,'LANGUAGE_UNCERTAIN')]:
    e.whisper.transcribe=lambda audio,**options:([],types.SimpleNamespace(language=lang,language_probability=probability))
    with self.assertRaisesRegex(ValueError,code):e.recognize(b'fixture',language='auto')
 def test_missing_whisper_does_not_fall_back_to_sensevoice_for_french(self):
  e=fixture();e.whisper=None
  with patch.object(voice,'decode_audio',return_value=([.02],.5)):
   with self.assertRaisesRegex(ValueError,'MULTILINGUAL_ASR_UNAVAILABLE'):e.recognize(b'fixture',language='fr')
 def test_automatic_language_uses_one_public_call_and_does_not_decode_unknown_language(self):
  e=fixture();calls=[];consumed=[]
  def transcribe(audio,**options):
   calls.append(options)
   def segments():consumed.append(True);yield types.SimpleNamespace(text='bonjour')
   return segments(),types.SimpleNamespace(language='fr',language_probability=.99)
  e.whisper.transcribe=transcribe
  with patch.object(voice,'decode_audio',return_value=([.02],.5)):
   self.assertEqual(e.recognize(b'fixture',language='auto')['text'],'bonjour')
  self.assertEqual(len(calls),1);self.assertIsNone(calls[0]['language']);self.assertEqual(consumed,[True])
  consumed.clear();e.whisper.transcribe=lambda audio,**options:(transcribe(audio,**options)[0],types.SimpleNamespace(language='es',language_probability=.99))
  with patch.object(voice,'decode_audio',return_value=([.02],.5)):
   with self.assertRaisesRegex(ValueError,'LANGUAGE_UNSUPPORTED'):e.recognize(b'fixture',language='auto')
  self.assertEqual(consumed,[])
 def test_piper_voice_language_is_checked_before_generation(self):
  e=fixture();e.piper={}
  for request,code in [({'model':'kokoro-resident','voice':'58','language':'fr'},'TTS_LANGUAGE_UNSUPPORTED'),({'model':'piper-resident','voice':'en-lessac','language':'fr'},'VOICE_LANGUAGE_MISMATCH'),({'model':'piper-resident','voice':'fr-siwis','language':'fr'},'MULTILINGUAL_TTS_UNAVAILABLE'),({'model':'piper-resident','voice':'fr-siwis','language':'auto'},'TTS_LANGUAGE_REQUIRED')]:
   with self.subTest(code=code):
    with self.assertRaisesRegex(ValueError,code):e.synthesize({**request,'input':'Bonjour.'})
if __name__=='__main__':unittest.main()
