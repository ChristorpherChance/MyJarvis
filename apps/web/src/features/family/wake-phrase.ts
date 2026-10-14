/** Preserve the original request while accepting ASR casing and word separators. */
export function matchWakePhrase(text:string,wakeWord:string):{detected:boolean;remaining:string}{
 const escaped=wakeWord.trim().split(/\s+/).map(word=>word.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('[\\s,，、-]+');
 if(!escaped)return {detected:false,remaining:text};
 const match=new RegExp(`(?<![A-Za-z])${escaped}(?![A-Za-z])`,'i').exec(text);
 return match?{detected:true,remaining:text.slice(match.index+match[0].length).replace(/^[，。！？、,.!?:：;；\s]+/,'')}:{detected:false,remaining:text};
}
