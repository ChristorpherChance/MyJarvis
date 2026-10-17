import test from 'node:test';
import assert from 'node:assert/strict';
import {personaValues,personaValidation,preferenceDraft,preferenceDirty,receivePreferences,savedPreferences,quietHours,quietHoursError,personaRecordValues} from '../../web/src/personal-settings-draft.js';
import {saveNotificationSettings,type NotificationPreferences} from '../../web/src/notifications-client.js';
import {V1Error} from '../../web/src/v1-client.js';

test('clean preferences follow real revisions, edited drafts keep their original CAS until explicit reload',()=>{
 let form=preferenceDraft('member-a',3,{quietStart:'22:00',quietEnd:'07:00',autoSpeak:false});
 form=receivePreferences(form,'member-a',6,{quietStart:'21:00',quietEnd:'06:00',autoSpeak:false});
 assert.equal(form.revision,6);assert.equal(form.values.quietStart,'21:00');assert.equal(preferenceDirty(form),false);
 form={...form,values:{...form.values,autoSpeak:true}};
 form=receivePreferences(form,'member-a',9,{quietStart:'20:00',quietEnd:'05:00',autoSpeak:false});
 assert.equal(form.revision,6);assert.equal(form.latestRevision,9);assert.equal(form.values.autoSpeak,true);assert.equal(form.values.quietStart,'21:00');assert.equal(form.conflict,true);
 form=preferenceDraft('member-a',9,{quietStart:'20:00',quietEnd:'05:00',autoSpeak:false});
 assert.equal(form.conflict,false);assert.equal(preferenceDirty(form),false);assert.equal(form.revision,9);
 form=savedPreferences(form,14,{quietStart:'',quietEnd:'',autoSpeak:true});
 assert.equal(form.revision,14);assert.equal(preferenceDirty(form),false);
 const old=receivePreferences(form,'member-a',9,{quietStart:'20:00',quietEnd:'05:00',autoSpeak:false});
 assert.strictEqual(old,form);assert.equal(old.values.autoSpeak,true);
 const other=receivePreferences(form,'member-b',2,{quietStart:'',quietEnd:'',autoSpeak:false});
 assert.equal(other.identity,'member-b');assert.equal(other.revision,2);assert.equal(other.values.autoSpeak,false);
});

test('a save receipt cannot hide a newer background revision',()=>{
 let form=preferenceDraft('member',4,{address:'initial'});
 form={...form,values:{address:'my edit'}};
 form=receivePreferences(form,'member',7,{address:'other device'});
 form=savedPreferences(form,6,{address:'my edit'});
 assert.equal(form.revision,6);assert.equal(form.latestRevision,7);assert.equal(form.conflict,true);assert.equal(form.values.address,'my edit');
});

test('empty quiet hours and zero remain visible; only explicit disable clears both times',()=>{
 const values=personaValues({address:'本人',wakeword:'贾维斯',dailyVoice:0,quietStart:'',quietEnd:'',configured:true});
 assert.equal(values.dailyVoice,0);assert.equal(values.quietStart,'');assert.equal(values.quietEnd,'');assert.equal(values.quietEnabled,false);
 assert.match(personaValidation(values),/1 至 300/);
 assert.deepEqual(quietHours(false,'22:00','07:00'),{quietStart:'',quietEnd:''});
 assert.match(quietHoursError(true,'','07:00'),/完整/);assert.match(quietHoursError(true,'24:00','07:00'),/完整/);
 assert.equal(quietHoursError(true,'07:00','07:00'),'');
 assert.equal(personaValidation({...values,dailyVoice:30}),'');
 assert.equal(personaValues({configured:false,wakeword:''}).wakeword,'贾维斯');
 assert.equal(personaValues({configured:true,wakeword:''}).wakeword,'');
 const saved=personaRecordValues({voiceId:'warm',wakeWord:'小贾',cloudPrivacy:'local',dailyVoiceMinutes:2,pace:'slow',quietStart:'',quietEnd:'',autoSpeak:true});
 assert.equal(saved.voice,'warm');assert.equal(saved.dailyVoice,2);assert.equal(saved.pace,'较慢');assert.equal(saved.autoSpeak,true);assert.equal(saved.quietEnabled,false);
});

test('denied or unsupported native notifications never prevent an actual preference PUT, and 409 remains explicit',async()=>{
 const originalFetch=globalThis.fetch,descriptor=Object.getOwnPropertyDescriptor(globalThis,'Notification');
 const values:NotificationPreferences={enabled:true,categories:{tasks:true},channels:{inApp:true,browser:true,roomVoice:true},quietStart:'22:00',quietEnd:'07:00',timezone:'Asia/Shanghai',allowCloudAudio:true};
 let calls=0,permissionRequests=0;
 try {
  globalThis.fetch=async(path,init)=>{calls++;assert.equal(path,'/api/runtime/notifications/preferences');assert.equal(init?.method,'PUT');const body=JSON.parse(String(init?.body));assert.equal(body.expectedVersion,8);assert.equal(body.values.channels.browser,true);assert.equal(body.values.channels.roomVoice,true);assert.equal(body.values.allowCloudAudio,true);assert.equal(body.values.quietStart,'');assert.equal(body.values.quietEnd,'');assert.equal('quietEnabled' in body.values,false);return Response.json({profileId:'own',revision:12,values:body.values,capabilities:{}})};
  Object.defineProperty(globalThis,'Notification',{configurable:true,value:{permission:'denied',requestPermission:()=>{permissionRequests++;throw Error('must remain a separate action')}}});
  assert.equal((await saveNotificationSettings(8,{...values,quietEnabled:false})).revision,12);
  Object.defineProperty(globalThis,'Notification',{configurable:true,value:undefined});
  assert.equal((await saveNotificationSettings(8,{...values,quietEnabled:false})).revision,12);
  assert.equal(calls,2);assert.equal(permissionRequests,0);
  globalThis.fetch=async()=>Response.json({error:{code:'VERSION_CONFLICT',message:'changed elsewhere'}},{status:409});
  await assert.rejects(()=>saveNotificationSettings(8,{...values,quietEnabled:false}),(error:unknown)=>error instanceof V1Error&&error.status===409);
  assert.throws(()=>saveNotificationSettings(8,{...values,quietEnabled:true,quietStart:''}),/完整/);
 }finally{globalThis.fetch=originalFetch;if(descriptor)Object.defineProperty(globalThis,'Notification',descriptor);else Reflect.deleteProperty(globalThis,'Notification')}
});
