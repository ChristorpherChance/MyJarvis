import {test} from 'node:test';
import assert from 'node:assert/strict';
import {resolveReplyLanguage,replyLanguagePreference,knownSpokenLanguage,voicePreviewText} from '../../web/src/features/family/conversation-language.js';
import {parseCaptureSettings} from '../../web/src/features/family/speech-endpoint.js';
import {openingGreeting,ConversationPresence} from '../../web/src/features/family/conversation-presence.js';
import {sendRoomMessageContinuing} from '../../web/src/features/family/room-api.js';

test('reply policy follows fixed member choice or real detection; legacy learning language cannot override it',()=>{
 assert.equal(resolveReplyLanguage({replyLanguage:'fr',language:'中文'},'en'),'fr');
 assert.equal(resolveReplyLanguage({replyLanguage:'auto',language:'Deutsch'},'en'),'en');
 assert.equal(resolveReplyLanguage({replyLanguage:'auto',language:'中文'},'fr'),'fr');
 assert.equal(resolveReplyLanguage({replyLanguage:'auto',language:'中文'}),'zh');
 assert.equal(replyLanguagePreference({language:'Deutsch'}),'auto');
 assert.throws(()=>resolveReplyLanguage({replyLanguage:'auto'},'es'),/暂未接入/);
 assert.equal(knownSpokenLanguage('Français'),'fr');
 assert.equal(parseCaptureSettings({language:'de'}).language,'de');
 assert.equal(parseCaptureSettings({language:'forged'}).language,'profile');
});
test('foreign greetings, previews and idle replies use the chosen language',()=>{
 for(const language of ['en','fr','de'] as const){
  assert.ok(!/[\u4e00-\u9fff]/.test(openingGreeting('家庭成员',language)));
  assert.ok(!/[\u4e00-\u9fff]/.test(voicePreviewText[language]));
  const presence=new ConversationPresence();presence.begin(0);
  assert.ok(!/[\u4e00-\u9fff]/.test(presence.take(true,21000,language)!));
 }
});
test('selected voice language survives safe deleted-conversation renewal',async()=>{
 const requests:unknown[]=[];const signal=new AbortController().signal;
 const result=await sendRoomMessageContinuing({conversationId:'deleted',text:'Bonjour',cloudConsent:true,voiceMode:true,voiceLanguage:'fr',signal,renew:async()=> 'renewed',request:async(path,body)=>{requests.push(body);if(path.includes('deleted'))throw Object.assign(new Error('gone'),{status:404,code:'NOT_FOUND'});return 'ok';}});
 assert.equal(result,'ok');assert.equal(requests.length,2);
 assert.deepEqual(requests[0],requests[1]);assert.equal((requests[1] as any).voiceLanguage,'fr');
});
