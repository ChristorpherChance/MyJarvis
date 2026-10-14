import {knownSpokenLanguage,type SpokenLanguage} from './conversation-language';
import {firstSentenceSpeechSegments} from './prepared-speech';
import {speechText} from './voice-stream';

export type CompanionSpeechSegment={text:string;language:SpokenLanguage|'ja'|'es';kind:'guide'|'target'};
export type CompanionSpeechPart={text:string;language:SpokenLanguage};

/** Explicit target segments with unsupported voices remain visible text, never guessed speech. */
export function companionSpeechParts(segments:unknown,text:string,fallback:SpokenLanguage):{parts:CompanionSpeechPart[];textOnlyLanguages:string[]}{
 const input=Array.isArray(segments)?segments:[{text,language:fallback}];
 const parts:CompanionSpeechPart[]=[],textOnlyLanguages=new Set<string>();
 for(const segment of input){
  if(!segment||typeof segment.text!=='string')continue;
  const language=knownSpokenLanguage(segment.language),spoken=speechText(segment.text);
  if(!language){if(spoken&&['ja','es'].includes(segment.language))textOnlyLanguages.add(segment.language);continue;}
  for(const part of firstSentenceSpeechSegments(spoken,180))parts.push({text:part,language});
 }
 return {parts,textOnlyLanguages:[...textOnlyLanguages]};
}
