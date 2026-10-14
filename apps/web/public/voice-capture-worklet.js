/* Microphone remains local until the authenticated browser submits a finished utterance. */
class JarvisVoiceCapture extends AudioWorkletProcessor{
 constructor(options){super();this.timestamps=options?.processorOptions?.timestamps===true;this.frame=new Float32Array(1600);this.index=0;this.phase=0;this.sum=0;this.count=0;}
 process(inputs){const input=inputs[0]?.[0];if(!input)return true;let offset=0;for(const value of input){offset++;this.sum+=value;this.count++;this.phase+=16000;if(this.phase>=sampleRate){this.phase-=sampleRate;this.frame[this.index++]=this.sum/this.count;this.sum=0;this.count=0;if(this.index===1600){const payload=this.timestamps?{samples:this.frame.buffer,endTime:(currentFrame+offset)/sampleRate}:this.frame.buffer;this.port.postMessage(payload,[this.frame.buffer]);this.frame=new Float32Array(1600);this.index=0;}}}return true;}
}
registerProcessor('jarvis-voice-capture',JarvisVoiceCapture);
