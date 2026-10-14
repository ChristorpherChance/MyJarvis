/** Numeric microphone telemetry only: no utterance, audio, device identity, or credentials. */
export const VOICE_CLIENT_BUILD='20261010-autonomous-voice-r19';
type Snapshot={frameCount:number;lastFrameAgeMs:number|null;rms:number;peak:number;noiseFloor:number;threshold:number|null;active:boolean;lastCapture:{outcome:string;durationMs:number;frameCount:number}|null};
export type VoiceDiagnosticInput={
 mode:'direct'|'standby'|'single'|'paused';phase:string;contextState:string;trackState:string;
 muted:boolean;trackMuted:boolean;snapshot:Snapshot|null;fallbackRecording:boolean;
 rms:number;peak:number;paused?:boolean;
};
const numeric=(value:unknown,max:number)=>typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=max?value:undefined;
export function voiceDiagnosticPayload(input:VoiceDiagnosticInput){
 const snapshot=input.snapshot,active=!input.paused&&(snapshot?.active===true||input.fallbackRecording);
 const phases=['idle','preparing','listening','transcribing','thinking','speaking','awaiting-playback','paused','error'];
 const requested=input.phase==='synthesizing'?'thinking':input.phase;
 const phase=input.paused?'paused':requested==='listening'&&!active?'preparing':phases.includes(requested)?requested:'idle';
 const outcome=active?'pending':({speech:'speech',silence:'silence',aborted:'interrupted',unavailable:'error'} as Record<string,string>)[snapshot?.lastCapture?.outcome??'']??'none';
 return {
  clientBuild:VOICE_CLIENT_BUILD,mode:input.paused?'paused':input.mode,phase,
  contextState:['running','suspended','interrupted','closed','none'].includes(input.contextState)?input.contextState:'none',
  trackState:['live','ended','none'].includes(input.trackState)?input.trackState:'none',muted:input.muted,trackMuted:input.trackMuted,
  capture:{frames:Math.floor(numeric(snapshot?.frameCount,10_000_000)??0),lastFrameAgeMs:numeric(snapshot?.lastFrameAgeMs,86_400_000),
   rms:numeric(snapshot?.rms??input.rms,1),peak:numeric(snapshot?.peak??input.peak,1),noiseFloor:numeric(snapshot?.noiseFloor,1),threshold:numeric(snapshot?.threshold,1),
   active,lastOutcome:outcome,durationMs:numeric(snapshot?.lastCapture?.durationMs,86_400_000)}
 };
}
