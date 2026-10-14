/** Anonymous input measurements only: never audio, transcript, or identifying device data. */
export type CaptureSnapshot={
 frameCount:number;lastFrameAgeMs:number|null;rms:number;peak:number;noiseFloor:number;
 threshold:number|null;active:boolean;
 lastCapture:{outcome:'speech'|'silence'|'aborted'|'unavailable';durationMs:number;frameCount:number}|null;
};
