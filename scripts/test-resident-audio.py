"""Run in the existing resident speech venv. Synthetic/official fixtures only."""
import importlib.util,io,json,os,threading,time,unittest,urllib.request,types
from pathlib import Path
import numpy as np
import sherpa_onnx

spec=importlib.util.spec_from_file_location('voice_audio_test',os.environ.get('JARVIS_RESIDENT_WORKER','/opt/jarvis/resident_voice.py'));voice=importlib.util.module_from_spec(spec);spec.loader.exec_module(voice)
class AudioTests(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  config=sherpa_onnx.VadModelConfig();config.silero_vad.model='/var/lib/jarvis/voice-models/silero_vad.onnx';config.sample_rate=16000;config.num_threads=1;config.silero_vad.threshold=.35;config.silero_vad.min_speech_duration=.12;config.silero_vad.min_silence_duration=.35;config.silero_vad.max_speech_duration=60
  cls.vad=sherpa_onnx.VoiceActivityDetector(config,buffer_size_in_seconds=70)
  token=Path('/var/lib/jarvis/voice-runtime/service-token').read_text().strip();request=urllib.request.Request('http://127.0.0.1:3153/v1/audio/speech',data=json.dumps({'model':'matcha-resident','voice':'0','input':'请检查书房服务器的运行状态。'}).encode(),headers={'Authorization':'Bearer '+token,'Content-Type':'application/json'})
  with urllib.request.urlopen(request,timeout=20) as response:cls.chinese=voice.decode_audio(response.read())[0]
  cls.english=voice.decode_audio(Path('/var/lib/jarvis/voice-models/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2025-09-09/test_wavs/en.wav').read_bytes())[0]
 def test_dc_and_quiet_gain_are_bounded_without_clipping(self):
  original=(np.sin(np.arange(16000)*.1)*.01+.02).astype(np.float32);prepared,peak,gain=voice.prepare_audio(original);self.assertAlmostEqual(float(np.mean(prepared)),0,places=6);self.assertEqual(gain,4);self.assertLess(float(np.max(np.abs(prepared))),.041)
  loud,peak,gain=voice.prepare_audio(np.array([-.95,.95],dtype=np.float32));self.assertEqual(gain,1);self.assertLessEqual(float(np.max(np.abs(loud))),.95)
 def test_invalid_audio_is_rejected(self):
  for samples in [np.array([],dtype=np.float32),np.array([float('nan')],dtype=np.float32),np.array([float('inf')],dtype=np.float32)]:
   with self.assertRaisesRegex(ValueError,'NO_SPEECH'):voice.prepare_audio(samples)
 def test_silence_and_synthetic_fan_do_not_reach_asr(self):
  for samples in [np.zeros(32000,dtype=np.float32),(.02*np.sin(np.arange(32000)*2*np.pi*100/16000)).astype(np.float32),np.random.default_rng(42).normal(0,.015,32000).astype(np.float32)]:
   prepared,_,_=voice.prepare_audio(samples);detected,seconds=voice.speech_bounds(self.vad,prepared);self.assertIsNone(detected);self.assertEqual(seconds,0)
 def test_chinese_and_official_english_are_retained(self):
  for original in [self.chinese,self.english]:
   with self.subTest(samples=len(original)):
    padded=np.concatenate((np.zeros(16000,dtype=np.float32),original,np.zeros(32000,dtype=np.float32)));prepared,_,_=voice.prepare_audio(padded);detected,seconds=voice.speech_bounds(self.vad,prepared);self.assertIsNotNone(detected);self.assertGreater(seconds,.2);self.assertLess(len(detected),len(padded));self.assertGreater(len(detected),len(original)*.7)
 def test_quiet_speech_and_same_vad_next_silence_do_not_leak(self):
  prepared,_,gain=voice.prepare_audio(self.chinese*.1);detected,seconds=voice.speech_bounds(self.vad,prepared);self.assertIsNotNone(detected);self.assertGreater(seconds,.2);self.assertGreater(gain,1);self.assertIsNone(voice.speech_bounds(self.vad,np.zeros(32000,dtype=np.float32))[0])
 def test_input_padding_does_not_change_the_usage_duration(self):
  # Duration charged remains decoded source duration; ASR-only trimming cannot erase usage.
  self.assertAlmostEqual(voice.decode_audio(bad_wav())[1],2,places=6)
def bad_wav():
 import wave
 buffer=io.BytesIO()
 with wave.open(buffer,'wb') as out:out.setnchannels(1);out.setsampwidth(2);out.setframerate(16000);out.writeframes(bytes(64000))
 return buffer.getvalue()
if __name__=='__main__':unittest.main()
