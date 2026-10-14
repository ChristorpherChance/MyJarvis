import { spawn } from 'node:child_process';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, isAbsolute } from 'node:path';
import { z } from 'zod';
import { RuntimeAccessError } from './identity.js';
import {voiceProviderUsage,type VoiceProviderUsage} from './voice-usage.js';

const safeUrl=z.string().max(2000).refine(value=>{try{const u=new URL(value);return ['http:','https:'].includes(u.protocol)&&!u.username&&!u.password&&!u.search&&!u.hash;}catch{return false;}},'HTTP地址无效');
export const engineSchema=z.discriminatedUnion('adapter',[
  z.object({adapter:z.literal('http'),baseUrl:safeUrl,apiKey:z.string().max(1000).optional(),model:z.string().min(1).max(120),voice:z.string().max(120).default('alloy'),voiceMap:z.record(z.string().min(1).max(120),z.string().max(120)).optional(),language:z.string().max(20).default('zh'),format:z.enum(['wav','mp3']).default('wav'),timeoutMs:z.number().int().min(100).max(180000).default(60000)}).strict(),
  z.object({adapter:z.literal('command'),executable:z.string().min(1).max(1000).refine(isAbsolute,'须为可执行文件绝对路径'),args:z.array(z.string().max(2000)).max(50),model:z.string().max(1000).default(''),voice:z.string().max(120).default(''),voiceMap:z.record(z.string().min(1).max(120),z.string().max(120)).optional(),language:z.string().max(20).default('zh'),format:z.enum(['wav','mp3']).default('wav'),timeoutMs:z.number().int().min(100).max(180000).default(120000)}).strict(),
]);
export type VoiceEngineConfig=z.infer<typeof engineSchema>;
export function audioExtension(mime:string,bytes:Uint8Array):string {
 const b=Buffer.from(bytes);const m=mime.split(';')[0].trim().toLowerCase();
 if(m==='audio/wav'||m==='audio/x-wav'){if(b.length>=44&&b.toString('ascii',0,4)==='RIFF'&&b.toString('ascii',8,12)==='WAVE')return 'wav';}
 if(m==='audio/webm'&&b.length>=4&&b.subarray(0,4).equals(Buffer.from([0x1a,0x45,0xdf,0xa3])))return 'webm';
 if((m==='audio/ogg'||m==='audio/opus')&&b.toString('ascii',0,4)==='OggS')return 'ogg';
 if((m==='audio/mpeg'||m==='audio/mp3')&&(b.toString('ascii',0,3)==='ID3'||(b.length>1&&b[0]===255&&(b[1]&224)===224)))return 'mp3';
 if((m==='audio/mp4'||m==='audio/m4a')&&b.length>=12&&b.toString('ascii',4,8)==='ftyp')return 'm4a';
 throw new RuntimeAccessError('INVALID_AUDIO','音频内容与格式不匹配；支持 WAV、WebM、Ogg、MP3、M4A');
}
async function limitedResponse(response:Response,limit:number,signal:AbortSignal):Promise<Buffer>{
 if(!response.body)return Buffer.alloc(0);let size=0;const chunks:Buffer[]=[];const reader=response.body.getReader();
 try{while(true){signal.throwIfAborted();const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>limit){await reader.cancel();throw new RuntimeAccessError('ENGINE_OUTPUT_LIMIT','语音引擎输出超过限制',502);}chunks.push(Buffer.from(value));}return Buffer.concat(chunks);}finally{reader.releaseLock();}
}
const residentAsrModels=['sensevoice-resident','whisper-small-resident'];
const residentTtsModels=['matcha-resident','kokoro-resident','piper-resident'];
const residentMessages:Record<string,string>={LANGUAGE_UNSUPPORTED:'本地引擎不支持检测到的语种；请明确选择中文、英语、法语或德语',LANGUAGE_UNCERTAIN:'录音语种不确定，请明确选择对话语言后再说一次',MULTILINGUAL_ASR_UNAVAILABLE:'多语种识别模型尚未安装，请管理员完成语音引擎准备',MULTILINGUAL_TTS_UNAVAILABLE:'该语种的人声尚未安装，请管理员完成语音引擎准备',TTS_LANGUAGE_REQUIRED:'请明确本轮朗读语言；法语和德语不能用英文人声代读',TTS_LANGUAGE_UNSUPPORTED:'当前人声不支持本轮语言，请选择对应语种的人声',VOICE_LANGUAGE_MISMATCH:'选择的人声与本轮语言不一致，请选择对应语种人声'};
async function engineFailure(response:Response,signal:AbortSignal,native=false,onUsage?:(usage:VoiceProviderUsage)=>void):Promise<never>{
 if(onUsage&&!native){try{const value=JSON.parse((await limitedResponse(response,4096,signal)).toString('utf8')),usage=voiceProviderUsage(value,response.headers);if(usage)onUsage(usage);}catch{/* Unknown usage remains explicitly recorded by the owning voice job. */}}
 if(native&&response.status===422){try{const parsed=JSON.parse((await limitedResponse(response,4096,signal)).toString('utf8'));if(typeof parsed.code==='string'&&residentMessages[parsed.code])throw new RuntimeAccessError(parsed.code,residentMessages[parsed.code],422);}catch(error){if(error instanceof RuntimeAccessError)throw error;}}
 throw new RuntimeAccessError('ENGINE_FAILED','语音引擎返回失败，请检查管理员配置',502);
}
async function command(config:Extract<VoiceEngineConfig,{adapter:'command'}>,values:Record<string,string>,signal:AbortSignal){
 const args=config.args.map(argument=>argument.replace(/\{([a-zA-Z]+)\}/g,(_,key)=>{if(!(key in values))throw new RuntimeAccessError('ENGINE_CONFIGURATION','命令参数含未支持的占位符');return values[key];}));
 if(signal.aborted)throw new RuntimeAccessError('CANCELLED','语音任务已取消',409);
 await new Promise<void>((resolve,reject)=>{
  const child=spawn(config.executable,args,{shell:false,windowsHide:true,stdio:['ignore','pipe','pipe']});
  let size=0,settled=false;const finish=(error?:unknown)=>{if(settled)return;settled=true;signal.removeEventListener('abort',abort);error?reject(error):resolve();};
  const abort=()=>{child.kill();finish(new RuntimeAccessError('CANCELLED','语音任务已取消',409));};signal.addEventListener('abort',abort,{once:true});
  child.stdout.on('data',(chunk:Buffer)=>{size+=chunk.length;if(size>256*1024){child.kill();finish(new RuntimeAccessError('ENGINE_OUTPUT_LIMIT','语音引擎日志超过限制',502));}});
  // stderr is consumed and bounded, never returned: engine diagnostics may contain credentials or text.
  child.stderr.on('data',(chunk:Buffer)=>{size+=chunk.length;if(size>256*1024){child.kill();finish(new RuntimeAccessError('ENGINE_OUTPUT_LIMIT','语音引擎日志超过限制',502));}});
  child.on('error',()=>finish(new RuntimeAccessError('ENGINE_UNAVAILABLE','本地语音引擎无法启动',502)));
  child.on('close',code=>finish(code===0?undefined:new RuntimeAccessError('ENGINE_FAILED','本地语音引擎未完成，请检查管理员配置',502)));
 });
}
export class VoiceAdapter {
 constructor(readonly config:VoiceEngineConfig,private onUsage?:(usage:VoiceProviderUsage)=>void){}
 async transcribe(audio:Buffer,mime:string,signal:AbortSignal,wakeWord?:string):Promise<{text:string;language:string;engine:string;model?:string;languageProbability?:number;languageUncertain?:boolean;wakeDetected?:boolean;wakeWord?:string;noSpeech?:boolean}> {
  const extension=audioExtension(mime,audio),c=this.config;const deadline=AbortSignal.timeout(c.timeoutMs),combined=AbortSignal.any([signal,deadline]);
  const resident=residentAsrModels.includes(c.model),model=c.model==='sensevoice-resident'&&['en','fr','de','auto'].includes(c.language)?'whisper-small-resident':c.model;
  if(resident&&!['auto','zh','en','fr','de','ja','ko','yue'].includes(c.language))throw new RuntimeAccessError('ASR_LANGUAGE_UNSUPPORTED','当前本地识别不支持所选语种；本轮新增英语、法语与德语',422);
  try {
   let result:unknown;
   if(c.adapter==='http'){
    const form=new FormData();form.append('file',new Blob([new Uint8Array(audio)],{type:mime.split(';')[0]}),`speech.${extension}`);form.append('model',model);form.append('response_format','json');if(c.language&&c.language!=='auto')form.append('language',c.language);if(wakeWord&&resident)form.append('wake_word',wakeWord);
    const response=await fetch(`${c.baseUrl.replace(/\/$/,'')}/audio/transcriptions`,{method:'POST',headers:c.apiKey?{Authorization:`Bearer ${c.apiKey}`}:{},body:form,signal:combined,redirect:'error'});
    const meteredHeader=voiceProviderUsage(null,response.headers);if(meteredHeader)this.onUsage?.(meteredHeader);
    if(!response.ok)await engineFailure(response,combined,resident,meteredHeader?undefined:this.onUsage);
    const data=await limitedResponse(response,256*1024,combined);try{result=JSON.parse(data.toString('utf8'));}catch{throw new RuntimeAccessError('ENGINE_RESPONSE','识别引擎没有返回有效JSON',502);}if(!meteredHeader){const usage=voiceProviderUsage(result,response.headers);if(usage)this.onUsage?.(usage);}
   } else {
    const directory=await mkdtemp(join(tmpdir(),'jarvis-asr-'));try{
     const input=join(directory,`input.${extension}`),output=join(directory,'transcript.json');await writeFile(input,audio,{mode:0o600});
     await command(c,{input,output,textFile:'',model:c.model,voice:c.voice,language:c.language,format:c.format,speed:'1',rate:'0'},combined);
     const data=await readFile(output);if(data.length>256*1024)throw new RuntimeAccessError('ENGINE_OUTPUT_LIMIT','识别文字超过限制',502);
     try{result=JSON.parse(data.toString('utf8'));}catch{throw new RuntimeAccessError('ENGINE_RESPONSE','本地识别结果没有有效JSON',502);}
    }finally{await rm(directory,{recursive:true,force:true});}
   }
   const localResident=c.adapter==='http'&&resident&&['127.0.0.1','localhost','[::1]'].includes(new URL(c.baseUrl).hostname);
   const parsed=z.object({text:z.string().trim().max(20000),language:z.string().max(30).optional(),model:z.string().max(120).optional(),languageProbability:z.number().finite().min(0).max(1).optional(),languageUncertain:z.boolean().optional(),wakeDetected:z.boolean().optional(),wakeWord:z.string().max(100).optional(),noSpeech:z.boolean().optional()}).passthrough().refine(d=>!!d.text||(localResident&&d.noSpeech===true)||(!!wakeWord&&resident&&d.wakeDetected===false&&d.wakeWord===wakeWord)).safeParse(result);
   if(!parsed.success)throw new RuntimeAccessError('NO_SPEECH','未识别到有效语句，请重试',422);
   if(localResident&&parsed.data.text&&(!parsed.data.language||parsed.data.language==='auto'))throw new RuntimeAccessError('ENGINE_RESPONSE','本地识别引擎未提供真实检测语种',502);
   return {text:parsed.data.text,language:parsed.data.language??c.language,engine:c.adapter,...parsed.data.model?{model:parsed.data.model}:{},...parsed.data.languageProbability!==undefined?{languageProbability:parsed.data.languageProbability}:{},...parsed.data.languageUncertain!==undefined?{languageUncertain:parsed.data.languageUncertain}:!parsed.data.language&&c.language==='auto'?{languageUncertain:true}:{},...localResident&&parsed.data.noSpeech===true?{noSpeech:true}:{},...wakeWord&&resident&&parsed.data.wakeWord===wakeWord?{wakeDetected:parsed.data.wakeDetected===true,wakeWord}:{}};
  } catch(error){if(signal.aborted)throw new RuntimeAccessError('CANCELLED','语音任务已取消',409);if(deadline.aborted)throw new RuntimeAccessError('ENGINE_TIMEOUT','语音识别超时',504);if(error instanceof RuntimeAccessError)throw error;throw new RuntimeAccessError('ENGINE_UNAVAILABLE','语音识别引擎不可用',502);}
 }
 async synthesize(text:string,signal:AbortSignal,voice?:string,speed=1):Promise<{audio:Buffer;mime:string;engine:string}> {
  const c=this.config,selectedVoice=voice||c.voice,deadline=AbortSignal.timeout(c.timeoutMs),combined=AbortSignal.any([signal,deadline]);
  try {
   let audio:Buffer;const mime=c.format==='mp3'?'audio/mpeg':'audio/wav';
   if(c.adapter==='http'){
    const native=residentTtsModels.includes(c.model);const response=await fetch(`${c.baseUrl.replace(/\/$/,'')}/audio/speech`,{method:'POST',headers:{'Content-Type':'application/json',...(c.apiKey?{Authorization:`Bearer ${c.apiKey}`}:{})},body:JSON.stringify({model:c.model,voice:selectedVoice,input:text,response_format:c.format,speed,...native?{language:c.language}:{}}),signal:combined,redirect:'error'});
    const usage=voiceProviderUsage(null,response.headers);if(usage)this.onUsage?.(usage);
    if(!response.ok)await engineFailure(response,combined,native,usage?undefined:this.onUsage);
    audio=await limitedResponse(response,25*1024*1024,combined);
   }else{
    const directory=await mkdtemp(join(tmpdir(),'jarvis-tts-'));try{
     const textFile=join(directory,'text.txt'),output=join(directory,`speech.${c.format}`);await writeFile(textFile,text,{encoding:'utf8',mode:0o600});
     await command(c,{input:'',output,textFile,model:c.model,voice:selectedVoice,language:c.language,format:c.format,speed:String(speed),rate:String(speed<1?-2:speed>1?2:0)},combined);
     audio=await readFile(output);if(audio.length>25*1024*1024)throw new RuntimeAccessError('ENGINE_OUTPUT_LIMIT','合成音频超过限制',502);
    }finally{await rm(directory,{recursive:true,force:true});}
   }
   audioExtension(mime,audio);return {audio,mime,engine:c.adapter};
  }catch(error){if(signal.aborted)throw new RuntimeAccessError('CANCELLED','语音任务已取消',409);if(deadline.aborted)throw new RuntimeAccessError('ENGINE_TIMEOUT','语音合成超时',504);if(error instanceof RuntimeAccessError)throw error;throw new RuntimeAccessError('ENGINE_UNAVAILABLE','语音合成引擎不可用',502);}
 }
}
