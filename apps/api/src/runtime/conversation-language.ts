import {z} from 'zod';
import {inferredResponseLanguage,type ResponseLanguage} from '../pi-routing.js';

export const replyLanguageSchema=z.enum(['auto','zh','en','fr','de']);
export type ReplyLanguage=z.infer<typeof replyLanguageSchema>;

function preferencesObject(value:unknown):Record<string,unknown>{
 if(value&&typeof value==='object'&&!Array.isArray(value))return value as Record<string,unknown>;
 if(typeof value==='string')try{const parsed=JSON.parse(value);if(parsed&&typeof parsed==='object'&&!Array.isArray(parsed))return parsed;}catch{}
 return {};
}

/** Old language selected an input hint; it is never silently turned into a fixed output policy. */
export function memberReplyLanguage(preferences:unknown):ReplyLanguage{
 const result=replyLanguageSchema.safeParse(preferencesObject(preferences).replyLanguage);
 return result.success?result.data:'auto';
}

export function replyLanguageRevision(preferences:unknown):number{
 const value=preferencesObject(preferences).replyLanguageRevision;
 return typeof value==='number'&&Number.isSafeInteger(value)&&value>=0?value:0;
}

function spokenLanguage(value:unknown):ResponseLanguage|undefined{
 const normalized=String(value??'').trim().toLowerCase();
 if(/^(zh(?:-(?:cn|tw|hans|hant))?|中文|汉语|普通话)$/.test(normalized))return 'zh';
 if(/^(en(?:-(?:us|gb))?|english|英语|英文)$/.test(normalized))return 'en';
 if(/^(fr(?:-fr)?|français|francais|french|法语|法文)$/.test(normalized))return 'fr';
 if(/^(de(?:-de)?|deutsch|german|德语|德文)$/.test(normalized))return 'de';
 return undefined;
}

/** Fixed member output wins. Automatic output follows actual ASR, then the current text; never another member. */
export function resolveReplyLanguage(preferences:unknown,detectedLanguage?:unknown,text=''):ResponseLanguage{
 const policy=memberReplyLanguage(preferences);
 if(policy!=='auto')return policy;
 return spokenLanguage(detectedLanguage)??inferredResponseLanguage(text);
}
