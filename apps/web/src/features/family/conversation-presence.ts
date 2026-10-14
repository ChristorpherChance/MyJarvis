/** One light nudge per silence interval, only during a conversation the user starts. */
export class ConversationPresence {
 private due=Infinity;private nudged=false;private sequence=0;
 begin(now=Date.now()){this.due=now+20000;this.nudged=false;}
 heard(now=Date.now()){this.due=now+30000;this.nudged=false;}
 afterReply(now=Date.now()){this.due=now+30000;}
 stop(){this.due=Infinity;this.nudged=true;}
 take(enabled:boolean,now=Date.now(),language:'zh'|'en'|'fr'|'de'='zh'){
  if(!enabled||this.nudged||now<this.due)return null;this.nudged=true;
  if(language!=='zh')return {en:'Take your time. My calendar has no traffic jams. I’m listening whenever you’re ready.',fr:'Prenez votre temps. Mon agenda n’a pas d’embouteillages. Je vous écoute.',de:'Lassen Sie sich Zeit. In meinem Kalender gibt es keinen Stau. Ich höre Ihnen zu.'}[language];
  return [
   '你是在测试我的耐心吗？放心，我不着急，毕竟我没有晚高峰要赶。准备好了就开口吧。',
   '我刚刚想了一个笑话：为什么电脑不怕冷？因为它有防火墙。好吧，这个有点冷，我继续听你说。',
   '你慢慢想，我先把耳朵竖起来。虽然我没有耳朵，但认真听你说这件事，我还是很擅长的。',
  ][this.sequence++%3];
 }
}
export function openingGreeting(name:string,language:'zh'|'en'|'fr'|'de'='zh'){
 if(language==='en')return 'Hello. I am Jarvis, your family assistant. We can chat, practise languages, or check your devices. What would you like to talk about?';
 if(language==='fr')return 'Bonjour. Je suis Jarvis, votre assistant familial. Nous pouvons discuter, pratiquer les langues ou consulter vos appareils. De quoi voulez-vous parler ?';
 if(language==='de')return 'Hallo. Ich bin Jarvis, Ihr Familienassistent. Wir können plaudern, Sprachen üben oder Ihre Geräte überprüfen. Worüber möchten Sie sprechen?';
 return `你好，${name.trim().slice(0,24)||'朋友'}。我是贾维斯，你的家庭管家。可以陪你聊天、练语言，也能帮你查看设备与事项。今天想先聊什么？`;
}
