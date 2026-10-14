import test from 'node:test';
import assert from 'node:assert/strict';
import {VOICE_CLIENT_BUILD,voiceDiagnosticPayload,type VoiceDiagnosticInput} from '../../web/src/features/family/voice-diagnostics-client.js';
const input=():VoiceDiagnosticInput=>({mode:'direct',phase:'listening',contextState:'running',trackState:'live',muted:false,trackMuted:false,rms:0,peak:0,fallbackRecording:false,snapshot:{frameCount:100,lastFrameAgeMs:30,rms:.01,peak:.08,noiseFloor:.004,threshold:.009,active:true,lastCapture:null}});
test('ready audio is distinct from an actually active recorder and preserves the direct mode',()=>{
 const ready=input();ready.snapshot!.active=false;const pending=voiceDiagnosticPayload(ready);assert.equal(pending.phase,'preparing');assert.equal(pending.capture.active,false);
 const recording=voiceDiagnosticPayload(input());assert.equal(recording.phase,'listening');assert.equal(recording.mode,'direct');assert.equal(recording.clientBuild,VOICE_CLIENT_BUILD);assert.equal(recording.capture.active,true);
});
test('the compatible recorder remains observable without a PCM capture',()=>{
 const ready=input();ready.snapshot=null;ready.fallbackRecording=true;ready.rms=.02;ready.peak=.1;const recording=voiceDiagnosticPayload(ready);assert.equal(recording.capture.active,true);assert.equal(recording.capture.rms,.02);
});
test('paused telemetry cannot advertise active listening or retain text, audio, non-finite values, or invalid states',()=>{
 const ready=input();ready.paused=true;ready.contextState='unexpected';ready.trackState='unexpected';ready.snapshot!.rms=NaN;ready.snapshot!.peak=Infinity;ready.snapshot!.threshold=-1;
 Object.assign(ready.snapshot!,{text:'private words',audio:new Uint8Array(4),credential:'secret'});
 const report=voiceDiagnosticPayload(ready),json=JSON.stringify(report);assert.equal(report.mode,'paused');assert.equal(report.phase,'paused');assert.equal(report.capture.active,false);assert.equal(report.contextState,'none');assert.equal(report.trackState,'none');for(const value of ['private words','audio','credential','secret','Infinity','NaN'])assert(!json.includes(value));
});
test('last capture failures and interrupted recordings carry only bounded numeric outcomes',()=>{
 const ready=input();ready.snapshot!.active=false;ready.snapshot!.lastCapture={outcome:'unavailable',durationMs:3100,frameCount:0};assert.equal(voiceDiagnosticPayload(ready).capture.lastOutcome,'error');
 ready.snapshot!.lastCapture.outcome='aborted';assert.equal(voiceDiagnosticPayload(ready).capture.lastOutcome,'interrupted');
 ready.snapshot!.lastCapture.durationMs=1e20;assert.equal(voiceDiagnosticPayload(ready).capture.durationMs,undefined);
});
