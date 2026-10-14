/** Speaker IDs match the installed Kokoro v1.1-zh model, not v1.0 voice names. */
export type CatalogVoice={id:string;name:string;gender:'male'|'female'|'unspecified';language:'zh-en'|'en'|'fr'|'de';accent:string;model?:string;sid?:string;speed?:number;latency:'fast'|'standard'|'configured';note:string};
const female=[1,2,3,4,5,6,7,8,17,18,19,21,22,23,24,26,27,28,32,36,38,39,40,42,43,44,46,47,48,49,51,59,60,67,70,71,72,73,74,75,76,77,78,79,83,84,85,86,87,88,90,92,93,94,99];
const male=[9,10,11,12,13,14,15,16,20,25,29,30,31,33,34,35,37,41,45,50,52,53,54,55,56,57,58,61,62,63,64,65,66,68,69,80,81,82,89,91,95,96,97,98,100];
export const voiceCatalog:CatalogVoice[]=[
 {id:'profile-default',name:'沿用专属管家设置',gender:'unspecified',language:'zh-en',accent:'按当前引擎',latency:'configured',note:'恢复档案声音与引擎映射。'},
 {id:'local-fast',name:'快速中英交流',gender:'unspecified',language:'zh-en',accent:'中英',model:'matcha-resident',sid:'0',latency:'fast',note:'优先响应速度，一款声音。'},
 {id:'jarvis-style',name:'贾维斯风格 · 管家男声',gender:'male',language:'zh-en',accent:'中文男声',model:'kokoro-resident',sid:'58',speed:.9,latency:'standard',note:'沉稳节奏的风格试选，不是电影原声复刻。'},
 {id:'piper:en-lessac',name:'英语人声 · Lessac',gender:'unspecified',language:'en',accent:'美式英语',model:'piper-resident',sid:'en-lessac',latency:'fast',note:'官方 Piper 英语模型；英语默认使用本语种人声。'},
 {id:'piper:fr-siwis',name:'法语人声 · Siwis',gender:'female',language:'fr',accent:'法国法语',model:'piper-resident',sid:'fr-siwis',latency:'fast',note:'官方 Piper 法语模型；法语不使用中文或英文模型代读。'},
 {id:'piper:de-thorsten',name:'德语人声 · Thorsten',gender:'male',language:'de',accent:'德国德语',model:'piper-resident',sid:'de-thorsten',latency:'fast',note:'官方 Piper 德语模型；德语不使用中文或英文模型代读。'},
 ...['af_maple','af_sol','bf_vale'].map((name,i):CatalogVoice=>({id:`kokoro:${i}`,name:i===2?'英式女声 · Vale':`美式女声 · ${i===0?'Maple':'Sol'}`,gender:'female',language:'en',accent:i===2?'英式':'美式',model:'kokoro-resident',sid:String(i),latency:'standard',note:`Kokoro ${name}，建议英语试听。`})),
 ...female.map((n,i):CatalogVoice=>({id:`kokoro:${i+3}`,name:`中文女声 ${String(i+1).padStart(2,'0')}`,gender:'female',language:'zh-en',accent:'中文',model:'kokoro-resident',sid:String(i+3),latency:'standard',note:`Kokoro zf_${String(n).padStart(3,'0')}；中英交流，先试听再选择。`})),
 ...male.map((n,i):CatalogVoice=>({id:`kokoro:${i+58}`,name:`中文男声 ${String(i+1).padStart(2,'0')}`,gender:'male',language:'zh-en',accent:'中文',model:'kokoro-resident',sid:String(i+58),latency:'standard',note:`Kokoro zm_${String(n).padStart(3,'0')}；中英交流，先试听再选择。`})),
];
export function catalogVoice(id:string){return voiceCatalog.find(voice=>voice.id===id);}
