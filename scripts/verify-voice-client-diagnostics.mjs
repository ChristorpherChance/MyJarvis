/** Isolated numeric test snapshot; no physical audio, model calls or personal preferences. */
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {withPlatform} from './managed-server-client.mjs';
const build='20261009-voice-capture-r15-1';
const report=await withPlatform(async({api})=>{
 assert.equal((await api('/api/health')).build,build);
 const session=await api('/api/runtime/voice/sessions',{roomId:'study'}),path=`/api/runtime/voice/sessions/${session.id}/diagnostics`;
 assert.deepEqual(await api(path),{available:false});
 const diagnostics={clientBuild:build+'-verification',mode:'paused',phase:'paused',contextState:'none',trackState:'none',muted:false,trackMuted:false,capture:{frames:0,active:false,lastOutcome:'none'}};
 const accepted=await api(path,diagnostics);assert.equal(accepted.accepted,true);
 const received=await api(path);assert.deepEqual(received.diagnostics,diagnostics);assert.equal(Date.parse(received.expiresAt)-Date.parse(received.receivedAt),86400000);
 await assert.rejects(api(path,{...diagnostics,text:'synthetic-disallowed-field'}),/API_400/);
 const ignored=await api(path,diagnostics);assert.equal(ignored.accepted,false);
 return {status:'passed',at:new Date().toISOString(),build,checks:['strict-numeric-diagnostics-route','latest-snapshot-and-24-hour-expiry','disallowed-text-rejected','same-session-cooldown'],modelCalls:0,physicalMicrophones:0,syntheticClientBuild:diagnostics.clientBuild};
},{syntheticVoice:true});
await mkdir('artifacts/mobile-voice-recovery',{recursive:true});await writeFile('artifacts/mobile-voice-recovery/production-diagnostics-r15.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
