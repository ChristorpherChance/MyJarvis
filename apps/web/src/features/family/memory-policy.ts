export interface VoiceMemory {text:string;status:'active'|'candidate';reason:string}
/** A text retention choice never substitutes for consent to a separate long-term memory. */
export function voiceMemory(data:any,profile:string,text:string):VoiceMemory|null {
 if(profile==='public'||!/记住|我喜欢|我不喜欢|以后.*(喜欢|希望)/.test(text))return null;
 const policy=data.v5?.vm?.policies?.[profile]?.longterm||'confirm';const explicit=/记住/.test(text);
 if(policy==='explicit'&&!explicit)return null;
 const lowRisk=!/健康|症状|病|密码|公司|财务|收入|电话|住址|银行卡|证件/.test(text);
 const auto=policy==='auto'&&lowRisk;const value=text.replace(/^.*?记住[：:，, ]?/,'').trim()||text;
 return {text:value.slice(0,1200),status:explicit||auto?'active':'candidate',reason:explicit?'本人明确要求记住':auto?'按本人策略整理低敏感偏好':'从对话形成候选，等待本人确认'};
}
