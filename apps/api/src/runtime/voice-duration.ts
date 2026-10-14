import {spawn} from 'node:child_process';
import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {audioExtension} from './voice-adapter.js';
import {RuntimeAccessError} from './identity.js';

/** Measure actual container samples. Browser duration claims are never used for billing. */
export async function measureAudioSeconds(bytes:Buffer,mime:string,signal:AbortSignal,pythonExecutable?:string):Promise<number>{
 const extension=audioExtension(mime,bytes);signal.throwIfAborted();
 if(extension==='wav'){
  let byteRate=0,dataBytes=0,channels=0,sampleRate=0,bits=0,format=0;
  for(let offset=12;offset+8<=bytes.length;){const kind=bytes.toString('ascii',offset,offset+4),size=bytes.readUInt32LE(offset+4),start=offset+8;if(start+size>bytes.length)throw new RuntimeAccessError('INVALID_AUDIO','WAV内容被截断');if(kind==='fmt '&&size>=16){format=bytes.readUInt16LE(start);channels=bytes.readUInt16LE(start+2);sampleRate=bytes.readUInt32LE(start+4);byteRate=bytes.readUInt32LE(start+8);bits=bytes.readUInt16LE(start+14);}if(kind==='data')dataBytes+=size;offset=start+size+(size%2);}
  if([1,3,65534].includes(format)&&byteRate>0&&dataBytes>0&&channels>0&&channels<=16&&sampleRate>=8000&&sampleRate<=384000&&bits>=8&&bits<=64&&byteRate===sampleRate*channels*bits/8)return dataBytes/byteRate;
 }
 if(!pythonExecutable)throw new RuntimeAccessError('AUDIO_METER_NOT_CONFIGURED','此音频格式需安装本地PyAV计量器；可先使用PCM WAV',503);
 const directory=await mkdtemp(join(tmpdir(),'jarvis-audio-meter-'));const input=join(directory,`input.${extension}`),output=join(directory,'duration.json'),worker=fileURLToPath(new URL('../../resources/voice/audio_duration.py',import.meta.url));
 const deadline=AbortSignal.timeout(30000),combined=AbortSignal.any([signal,deadline]);
 try{
  await writeFile(input,bytes,{mode:0o600});await new Promise<void>((resolve,reject)=>{const child=spawn(pythonExecutable,[worker,'--input',input,'--output',output],{shell:false,windowsHide:true,stdio:['ignore','pipe','pipe']});let finished=false,size=0;const done=(error?:Error)=>{if(finished)return;finished=true;combined.removeEventListener('abort',abort);error?reject(error):resolve();};const abort=()=>{child.kill();done(new RuntimeAccessError(deadline.aborted?'ENGINE_TIMEOUT':'CANCELLED','音频计量已停止',deadline.aborted?504:409));};combined.addEventListener('abort',abort,{once:true});if(combined.aborted)abort();for(const pipe of [child.stdout,child.stderr])pipe.on('data',(chunk:Buffer)=>{size+=chunk.length;if(size>256*1024){child.kill();done(new RuntimeAccessError('ENGINE_OUTPUT_LIMIT','音频计量输出超过限制',502));}});child.on('error',()=>done(new RuntimeAccessError('AUDIO_METER_NOT_CONFIGURED','本地音频计量器无法启动',503)));child.on('close',code=>done(code===0?undefined:new RuntimeAccessError('INVALID_AUDIO','音频无法解码或超过10分钟',422)));});
  const result=JSON.parse(await readFile(output,'utf8'));if(!Number.isFinite(result.seconds)||result.seconds<=0||result.seconds>600)throw new RuntimeAccessError('INVALID_AUDIO','没有可计量的音频帧',422);return result.seconds;
 }finally{await rm(directory,{recursive:true,force:true});}
}
