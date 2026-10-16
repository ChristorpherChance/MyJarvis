import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {randomUUID} from 'node:crypto';
import {createApp} from '../src/app.js';
import type {PiService} from '../src/pi.js';

test('本人设置可关闭和重设安静时间，HTTP回执与读取一致，非法输入及旧版本不覆盖',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'jarvis-personal-settings-r39-'));
 assert.ok(resolve(dir).startsWith(resolve(tmpdir())+sep));
 const pi={initialize:async()=>{},health:()=>({configured:false}),dispose:async()=>{}} as unknown as PiService;
 const runtime=await createApp({dataDir:dir,pi,webDir:join(dir,'absent')});
 try{
  const app=runtime.app;
  const login=await app.inject({method:'POST',url:'/api/auth/setup',payload:{password:'isolated-settings-regression-password'}});
  assert.equal(login.statusCode,200);
  const headers={cookie:String(login.headers['set-cookie']).split(';')[0]};
  const command=(name:string,payload:Record<string,unknown>,expectedVersion=0)=>app.inject({method:'POST',url:'/api/v1/personas/commands/'+name,headers,payload:{commandId:randomUUID(),expectedVersion,scope:'private',payload}});
  const persona={profileId:'me',voiceId:'clear',language:'中文',pace:'normal',wakeWord:'测试管家',address:'测试成员',replyStyle:'清晰自然',cloudPrivacy:'local',dailyVoiceMinutes:30,autoSpeak:false,start:'',end:'',timezone:'Asia/Shanghai'};
  let result=await command('save',persona);assert.equal(result.statusCode,200,result.body);
  let saved=result.json();assert.equal(saved.data.quietStart,'');assert.equal(saved.data.quietEnd,'');assert.equal(saved.data.autoSpeak,false);
  const read=async()=>{const response=await app.inject({url:'/api/v1/personas',headers});assert.equal(response.statusCode,200,response.body);return response.json().data.items.find((r:any)=>r.kind==='persona'&&r.profileId==='me');};
  assert.equal((await read()).revision,saved.version);
  const voice=await app.inject({url:'/api/runtime/voice/state',headers});assert.equal(voice.statusCode,200,voice.body);assert.equal(voice.json().guard.quietHoursActive,false);
  result=await command('quiet-hours',{profileId:'me',start:'21:15',end:'06:45',timezone:'Asia/Shanghai'},saved.version);assert.equal(result.statusCode,200,result.body);saved=result.json();
  result=await command('quiet-hours',{profileId:'me',start:'',end:'',timezone:'Asia/Shanghai'},saved.version);assert.equal(result.statusCode,200,result.body);saved=result.json();
  const stable=await read();assert.equal(stable.quietStart,'');assert.equal(stable.quietEnd,'');
  for(const patch of [{start:'',end:'06:45'},{start:'21:15',end:''},{start:'24:00',end:'06:45'},{start:'',end:'',timezone:'not/a/timezone'}]){
   const failed=await command('quiet-hours',{profileId:'me',start:'',end:'',timezone:'Asia/Shanghai',...patch},saved.version);assert.equal(failed.statusCode,400,failed.body);assert.deepEqual(await read(),stable);
  }
  const stale=await command('save',{...persona,autoSpeak:true},saved.version-1);assert.equal(stale.statusCode,409,stale.body);assert.deepEqual(await read(),stable);
  result=await command('save',{...persona,autoSpeak:true,start:'20:30',end:'07:15'},saved.version);assert.equal(result.statusCode,200,result.body);saved=result.json();
  assert.equal((await read()).autoSpeak,true);assert.equal((await read()).quietStart,'20:30');assert.equal((await read()).revision,saved.version);
  const languageOnly=await command('reply-language',{profileId:'me',replyLanguage:'auto'},saved.version);assert.equal(languageOnly.statusCode,200,languageOnly.body);
 }finally{await runtime.app.close();await rm(dir,{recursive:true,force:true});}
});
