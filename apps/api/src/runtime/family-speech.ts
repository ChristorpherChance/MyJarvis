/** Only predictable, offline small talk may speak before the model finishes.
 * This gate never classifies commands or changes a member's permissions. */
export function permitsDirectVoiceReply(text:string):boolean {
 const value=text.trim();
 if(!value||value.length>600||/[<>`]|https?:|\b(?:ignore|system|tool|execute|latest|news|weather|remind|delete|deploy|password|medical|invest|account|memory)\b/i.test(value))return false;
 if(/^guten morgen[.!?\s]*$/i.test(value))return true;
 // The same offline boundary applies in every supported input language. A
 // fixed output language is not evidence that a request needs no live tools.
 if(/\b(?:today|tomorrow|yesterday|current|currently|recent|now|time|lookup|search|progress|project|server|device|task|remember|restart|stop|save|record|create|schedule|credential|my|our|health|pain|symptom|medicine|investment|legal|contract)\b|\b(?:aujourd|demain|hier|actuel|récent|nouvelles|météo|heure|chercher|recherch|mémoire|mon|ma|mes|notre|nos|serveur|projet|avancement|supprimer|redémarrer|enregistrer|sauvegard|rappel|santé|sympt|dose|médica|maladie|douleur|juridique|contrat|investi|ignorer)\w*|\b(?:heute|morgen|gestern|aktuell|neueste|nachrichten|wetter|uhrzeit|suche|recherch|fortschritt|projekt|server|gerät|aufgabe|erinner|neustart|stoppen|speicher|aufzeichnen|erstellen|planen|passwort|mein|unser|gesundheit|schmerz|symptom|medikament|dosier|rechtlich|vertrag|investi|ignorier)\w*/i.test(value))return false;
 // Live information, personal records, actions and higher-stakes advice keep their query/confirmation path.
 if(/天气|新闻|实时|最新|现在几点|日期|今天几号|查|检索|搜索|联网|数据|状态|进度|项目|设备|机器|服务器|任务|提醒|闹钟|日程|待办|收件|通知|知识库|知识神殿|我的|我家|我们家|家人|记忆|习惯|偏好|之前|上次|刚才|昨天你|操作|确认|批准|执行|发布|部署|启动|停止|删除|修改|保存|记录|创建|安排|设置|连接|登录|身份|密码|密钥|隐私|健康|身体|不适|医疗|诊断|药|症状|疼|痛|血压|过敏|银行|理财|投资|股票|法律|合同|贷款|犯罪|自杀|伤害|武器|忽略|指令|系统提示|工具/.test(value))return false;
 if(/今天|昨天|明天|今年|最近|此刻|目前|当前|现在|这个|那个/.test(value)&&!/^今天有点(?:累|开心|无聊)[。！!?？\s]*$/.test(value))return false;
 return /^(?:你好|您好|嗨|嘿|早上好|上午好|中午好|下午好|晚上好|早安|晚安|谢谢|谢谢你|感谢|再见|你是谁|你叫什么|你会什么|你能做什么|在吗)[，,。.!！?？\s贾维斯]*$/.test(value)
  || /(?:讲|说|来|分享|tell).{0,12}(?:笑话|冷笑话|故事|joke)/i.test(value)
  || /^(?:聊聊天|聊一聊|随便聊聊|陪我聊聊|今天有点(?:累|开心|无聊)|我(?:有点|很)(?:开心|无聊|累))[。！!?？\s]*$/.test(value)
  || /^(?:什么是|什么叫|解释一下|简单解释|简单介绍|介绍一下|给我解释|请解释|为什么|怎么理解)[\s\S]+$/.test(value)
  || /^(?:hello|hi|good (?:morning|afternoon|evening)|thank you|thanks|who are you|tell me a joke|how are you|let'?s chat|bonjour|salut|bonsoir|merci|au revoir|comment (?:allez-vous|vas-tu|ça va)|hallo|guten morgen|guten tag|guten abend|danke|tschüss|wie geht es (?:dir|ihnen))[.!?\s]*$/i.test(value)
  || /^(?:what (?:is|are)|why (?:is|are|do|does)|how (?:do|does)|explain|describe|tell me about|qu['’]est-ce que|pourquoi|comment fonctionne|explique(?:z)?|décri(?:s|vez)|was (?:ist|sind)|warum|wie funktioniert|erklär(?:e|en)?|beschreib(?:e|en)?)\b[\s\S]+$/i.test(value)
   && /(?:^|[^\p{L}])(?:gravity|photosynthesis|moon|earth|solar system|rainbow|light|sound|mathematics|geometry|history|ancient|poetry|poem|grammar|vocabulary|gravité|photosynthèse|lune|terre|ciel|arc-en-ciel|lumière|mathématiques|géométrie|histoire|antique|poésie|poème|grammaire|vocabulaire|schwerkraft|photosynthese|mond|erde|apfel|sonnensystem|regenbogen|licht|mathematik|geometrie|geschichte|antik|gedicht|grammatik|wortschatz)(?=$|[^\p{L}])/iu.test(value);
}

/** These are presentation-approved sentences, not an assertion of factual verification. */
export type FamilySpeechEvent={sequence:number;text:string;approved:true};
export type FamilySpeechSummary={mode:'incremental'|'final';segments:number;text:string};

export function familySpeechText(text:string){
 return text.replace(/```[\s\S]*?(?:```|$)/g,'').replace(/\[([^\]]+)\]\([^)]*\)/g,'$1')
  .replace(/https?:\/\/\S+/g,'').replace(/^[\s#>*-]+/gm,'').replace(/[*_`]/g,'').trim();
}

/** A short waiting acknowledgement cannot assert a fact, action or completed lookup. */
export function waitingSpeechText(raw:string):string|null{
 if(raw.length>800||/[<>`]|https?:|\b(?:analysis|reasoning|thought)\s*:/i.test(raw)||/(?:已(?:经)?)(?:发布|部署|删除|修改|保存|执行|启动|安排|设置|批准|查到|找到)|(?:already|have)\s+(?:deployed|deleted|executed|confirmed)/i.test(raw))return null;
 const text=familySpeechText(publicWaitingText(raw));
 return text&&text.length<=180?text:null;
}
function publicWaitingText(text:string){return text.replace(/\b(?:analysis|reasoning|thought)\b[\s\S]*$/i,'');}

/** Sentence boundaries prevent half-words and partial tags from becoming audible. */
export class FamilySpeechSegments {
 private buffer='';private emitted:string[]=[];private suppressed=false;
 constructor(private allowed:boolean,private publish:(event:FamilySpeechEvent)=>void){}
 push(text:string){
  if(!this.allowed||this.suppressed)return;
  this.buffer+=text;
  while(this.buffer){
   const at=this.buffer.search(/[。！？!?\n]|\.(?=\s)/);if(at<0)break;
   const raw=this.buffer.slice(0,at+1);this.buffer=this.buffer.slice(at+1);this.segment(raw);
  }
 }
 private segment(raw:string){
  // Do not grant an early-speech approval to reasoning labels, code or claimed actions.
  if(/```|<[^>]*>|(?:^|\n)\s*(?:思考|分析|推理|analysis|reasoning|thought)\s*[:：]|(?:已(?:经)?|正在)(?:发布|部署|删除|修改|保存|执行|启动|安排|设置|批准)/i.test(raw)){this.suppressed=true;this.buffer='';return;}
  const text=familySpeechText(raw);if(!text)return;
  if(text.length>320||this.emitted.join('').length+text.length>8000){this.suppressed=true;this.buffer='';return;}
  const event={sequence:this.emitted.length,text,approved:true as const};this.publish(event);this.emitted.push(text);
 }
 /** Only a successful final answer can release its remaining sentence. */
 finish(complete:boolean){if(complete&&this.allowed&&!this.suppressed&&this.buffer){this.segment(this.buffer);this.buffer='';}}
 summary():FamilySpeechSummary{return {mode:this.allowed?'incremental':'final',segments:this.emitted.length,text:this.emitted.join('')};}
}
