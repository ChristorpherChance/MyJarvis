export type SpokenLanguage='zh'|'en'|'fr'|'de';
export type ReplyLanguage='auto'|SpokenLanguage;
export type ReplyLanguagePreferences={replyLanguage?:unknown;language?:unknown};
export function knownSpokenLanguage(value:unknown):SpokenLanguage|undefined{
 const language=String(value??'').trim().toLowerCase();
 if(/^(zh|zh-cn|zh-tw|中文|汉语|普通话)$/.test(language))return 'zh';
 if(/^(en|en-us|en-gb|english|英语|英文)$/.test(language))return 'en';
 if(/^(fr|fr-fr|français|francais|french|法语|法文)$/.test(language))return 'fr';
 if(/^(de|de-de|deutsch|german|德语|德文)$/.test(language))return 'de';
 return undefined;
}
/** Legacy language describes learning preferences, never a fixed reply policy. */
export function replyLanguagePreference(preferences?:ReplyLanguagePreferences|null):ReplyLanguage{
 const value=preferences?.replyLanguage;
 return value==='auto'||value==='zh'||value==='en'||value==='fr'||value==='de'?value:'auto';
}
/** Resolve actual ASR metadata, independently of input hints or practice languages. */
export function resolveReplyLanguage(preferences?:ReplyLanguagePreferences|null,detected?:unknown,fallback:SpokenLanguage='zh'):SpokenLanguage{
 const policy=replyLanguagePreference(preferences);
 if(policy!=='auto')return policy;
 if(detected===undefined||detected===null||detected==='')return fallback;
 const language=knownSpokenLanguage(detected);
 if(!language)throw Object.assign(new Error('当前识别语种暂未接入朗读；可在回复语言中选择中文、英语、法语或德语。'),{code:'REPLY_LANGUAGE_UNSUPPORTED'});
 return language;
}
/** Compatibility for local replies from older servers without language metadata. */
export function replyTextLanguage(metadata:unknown,text:string,fallback:SpokenLanguage='zh'):SpokenLanguage{
 const explicit=knownSpokenLanguage(metadata);if(explicit)return explicit;
 if(/[\u3400-\u9fff]/.test(text))return 'zh';
 if(/\b(?:bonjour|salut|merci|pourquoi|comment|pourriez|français|aujourd'hui|je suis|qu'est)\b/i.test(text))return 'fr';
 if(/\b(?:hallo|danke|warum|deutsch|bitte|kannst|können|wie geht|ich bin|vergleichen)\b/i.test(text))return 'de';
 return /[A-Za-z]/.test(text)?'en':fallback;
}
export const voicePreviewText:Record<SpokenLanguage,string>={
 zh:'你好，我是你的管家。你可以先听听这个声音，我们再慢慢聊。',
 en:'Hello. I am your assistant. How may I help you today?',
 fr:'Bonjour. Je suis votre assistant. Comment puis-je vous aider aujourd’hui ?',
 de:'Hallo. Ich bin Ihr Assistent. Wie kann ich Ihnen heute helfen?',
};
