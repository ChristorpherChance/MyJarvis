import test from 'node:test';
import assert from 'node:assert/strict';
import {SpeechEndpoint,defaultCaptureSettings,parseCaptureSettings} from '../../web/src/features/family/speech-endpoint.js';
import {ambientNoiseFloor} from '../../web/src/features/family/browser-mic.js';

test('steady fan noise above the old threshold stays silent; foreground speech still ends normally',()=>{
 const detector=new SpeechEndpoint(defaultCaptureSettings,0,false,.018);for(let now=100;now<=3000;now+=100)assert.equal(detector.accept(.019,now),false);assert.equal(detector.sawSpeech,false);
 for(let now=3100;now<=4100;now+=100)assert.equal(detector.accept(.09,now),false);assert.equal(detector.sawSpeech,true);assert.equal(detector.accept(.019,5100),false);assert.equal(detector.accept(.019,5200),true);
});
test('ambient sampling excludes brief peaks and invalid measurements, and remains bounded',()=>{
 assert.equal(ambientNoiseFloor([.008,.008,.009,.008,.9,.4,.7,.8]),.008);assert.equal(ambientNoiseFloor([NaN,Infinity,-1]),0);assert.equal(ambientNoiseFloor([1,1,1,1,1]),.15);
});

test('ordinary soft speech below the preceding fixed threshold is retained, including thinking pauses',()=>{
 const d=new SpeechEndpoint(defaultCaptureSettings,0);
 for(let now=100;now<=1000;now+=100)assert.equal(d.accept(.012,now),false);
 assert.equal(d.sawSpeech,true);assert.equal(d.accept(0,1650),false);
 assert.equal(d.accept(.012,1750),false);assert.equal(d.accept(0,2849),false);assert.equal(d.accept(0,2850),true);
});
test('slow speech mode tolerates a mid-sentence pause and waits for the configured ending',()=>{
 const d=new SpeechEndpoint({...defaultCaptureSettings,pauseMs:1600},0);
 d.accept(.04,100);d.accept(.04,200);assert.equal(d.accept(0,1500),false);d.accept(.04,1600);
 assert.equal(d.accept(0,3199),false);assert.equal(d.accept(0,3200),true);
});
test('a short click is not treated as an utterance; silence and long recording limits remain bounded',()=>{
 const d=new SpeechEndpoint(defaultCaptureSettings,0);d.accept(.1,100);d.accept(0,200);assert.equal(d.sawSpeech,false);assert.equal(d.accept(0,9999),false);assert.equal(d.accept(0,10000),true);
 const continuous=new SpeechEndpoint(defaultCaptureSettings,0);for(let now=100;now<45000;now+=100)assert.equal(continuous.accept(.04,now),false);assert.equal(continuous.accept(.04,45000),true);
});
test('sensitivity choices affect endpoint detection without altering recorded samples',()=>{
 const soft=new SpeechEndpoint({...defaultCaptureSettings,sensitivity:'soft'},0),normal=new SpeechEndpoint(defaultCaptureSettings,0),noisy=new SpeechEndpoint({...defaultCaptureSettings,sensitivity:'noisy'},0);
 for(let now=100;now<=400;now+=100){soft.accept(.006,now);normal.accept(.006,now);noisy.accept(.02,now);}
 assert.equal(soft.sawSpeech,true);assert.equal(normal.sawSpeech,false);assert.equal(noisy.sawSpeech,false);
});
test('invalid stored settings cannot introduce unbounded pauses or arbitrary language headers',()=>{
 assert.deepEqual(parseCaptureSettings({pauseMs:Infinity,language:'forged',sensitivity:'x'}),defaultCaptureSettings);assert.deepEqual(parseCaptureSettings(null),defaultCaptureSettings);
 assert.equal(parseCaptureSettings({pauseMs:1600,language:'zh',sensitivity:'soft'}).pauseMs,1600);
});
