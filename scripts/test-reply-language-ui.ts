import test from 'node:test';
import assert from 'node:assert/strict';
import {replyLanguagePreference,resolveReplyLanguage,replyTextLanguage} from '../apps/web/src/features/family/conversation-language';
import {companionSpeechParts} from '../apps/web/src/features/family/companion-speech';
import {readSpokenFamilyStream,readFamilyStream} from '../apps/web/src/features/family/voice-stream';
import {playbackPreferences} from '../apps/web/src/features/family/useCentralVoice';
import {projectLiveFamily} from '../apps/web/src/demo/live-family-projection';
import {translateLiveFamily} from '../apps/web/src/demo/live-family-commands';
import {freshDemo,reduceDemo} from '../apps/web/src/demo/model';
const packet=(event:string,data:unknown)=>`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
const response=(events:string)=>new Response(events,{headers:{'content-type':'text/event-stream'}});

test('旧学习语言不会变为固定输出，自动跟随实际识别且固定策略独立输入语种',()=>{
 assert.equal(replyLanguagePreference({language:'英语'}),'auto');
 assert.equal(resolveReplyLanguage({language:'英语'},'fr'),'fr');
 assert.equal(resolveReplyLanguage({replyLanguage:'auto'},'de'),'de');
 for(const language of ['zh','en','fr','de'])assert.equal(resolveReplyLanguage({replyLanguage:language},'fr'),language);
 assert.throws(()=>resolveReplyLanguage({replyLanguage:'auto'},'ja'),{code:'REPLY_LANGUAGE_UNSUPPORTED'});
 assert.deepEqual(playbackPreferences({language:'英语',voice:'warm',pace:'较慢'}),{language:'auto',voice:'warm',pace:'slow'});
});
test('分段引导保持教师语种，日西目标只文字且显式空segments不能重播全文',()=>{
 const segments=[{text:'English guide',language:'en',kind:'guide'},{text:'Bonjour.',language:'fr',kind:'target'},{text:'こんにちは',language:'ja',kind:'target'},{text:'Hola.',language:'es',kind:'target'}];
 assert.deepEqual(companionSpeechParts(segments,'must not replay','zh'),{parts:[{text:'English guide',language:'en'},{text:'Bonjour.',language:'fr'}],textOnlyLanguages:['ja','es']});
 assert.deepEqual(companionSpeechParts([], 'must not replay','zh').parts,[]);
 assert.deepEqual(companionSpeechParts(undefined,'Legacy English guide','en').parts,[{text:'Legacy English guide',language:'en'}]);
});
test('服务端status先冻结输出，首音频之后route/done不能更改同一队列的后续语种',async()=>{
 let language='zh';const prepared:{text:string;language:string}[]=[],languages:string[]=[];
 const events=packet('status',{phase:'thinking',responseLanguage:'en'})+packet('transition',{sequence:0,text:'Please wait.',approved:true})+packet('route',{tier:'advanced',responseLanguage:'de'})+packet('speech',{sequence:0,text:'English result.',approved:true})+packet('done',{status:'complete',responseLanguage:'fr',message:{content:'English result.'},speech:{mode:'incremental',segments:1,text:'English result.'},transition:{segments:1,text:'Please wait.'}});
 await readSpokenFamilyStream(response(events),new AbortController().signal,()=>{},{prepare:async text=>{const part={text,language};prepared.push(part);return part;},play:async(_part,_signal,started)=>started(),discard:async()=>{}},{responseLanguage:value=>{language=value;languages.push(value);}});
 assert.deepEqual(languages,['en']);assert.deepEqual(prepared.map(p=>p.language),['en','en']);
});
test('旧server仅route或done回显可在首音频前补充语种，route回调保留白名单字段',async()=>{
 let language='zh',route:any;
 const ops={prepare:async(text:string)=>text,play:async(_text:string,_signal:AbortSignal,started:()=>void)=>started(),discard:async()=>{}};
 await readSpokenFamilyStream(response(packet('done',{status:'complete',responseLanguage:'de',message:{content:'Legacy reply.'}})),new AbortController().signal,()=>{},ops,{responseLanguage:value=>{language=value;}});assert.equal(language,'de');
 await readFamilyStream(response(packet('route',{tier:'fast',model:'fixture',responseLanguage:'fr',private:'discard'})+packet('done',{status:'complete',message:{content:'Complete.'}})),new AbortController().signal,()=>{},undefined,undefined,value=>{route=value;});assert.equal(route.responseLanguage,'fr');assert(!('private'in route));
});
test('成员投影和管理DTO保留canonical输出策略，旧调用不能清除已保存的replyLanguage',()=>{
 const projected=projectLiveFamily({personas:[{kind:'persona',profileId:'me',scope:'private',language:'英语',replyLanguage:'de',revision:1} as any]}, {members:[{id:'owner',name:'合成人物'}]});assert.equal(projected.preferences.me.replyLanguage,'de');assert.equal(projected.preferences.me.language,'英语');
 const legacy=projectLiveFamily({}, {members:[{id:'owner',name:'合成人物',preferences:{language:'英语'}}]});assert.equal(legacy.preferences.me.replyLanguage,'auto');
 const data={profile:'me'} as any;assert.equal(translateLiveFamily('persona.save',{profile:'me',replyLanguage:'en'},data,{}).body.replyLanguage,'en');assert(!('replyLanguage'in translateLiveFamily('persona.save',{profile:'me'},data,{}).body));
});
test('演示canonical回复策略逐成员保存，缺省auto且拒绝无法朗读的固定策略',()=>{
 let data=freshDemo();data=reduceDemo(data,{type:'persona.save',payload:{profile:'me',replyLanguage:'fr'}});assert.equal(data.preferences.me.replyLanguage,'fr');assert.notEqual(data.preferences.wife.replyLanguage,'fr');
 data=reduceDemo(data,{type:'persona.save',payload:{profile:'me',language:'英语'}});assert.equal(data.preferences.me.replyLanguage,'fr');
 assert.throws(()=>reduceDemo(data,{type:'persona.save',payload:{profile:'me',replyLanguage:'ja'}}),/回复语言/);
});

test('本地提案/确认优先speechLanguage，旧缺字段按真实提示正文辨认四语种',()=>{
 assert.equal(replyTextLanguage('en','中文标题'),'en');assert.equal(replyTextLanguage('fr','Saved.','en'),'fr');
 for(const [text,language] of [['已保存私人收件。','zh'],['Bonjour. Merci.','fr'],['Hallo. Danke.','de'],['Saved the record.','en']])assert.equal(replyTextLanguage(undefined,text,'de'),language);
});
