import { z } from 'zod';

export const modelScenarios = [
  { id: 'chat', name: '管家对话', description: '管理员对话与平台查询' },
  { id: 'family-chat', name: '家庭对话', description: '成员聊天与房间语音对话' },
  { id: 'voice-intent', name: '意图理解', description: '将语音原话整理为待确认选项' },
  { id: 'companion', name: '学习陪伴', description: '语言陪练、知识教学与食谱建议' },
  { id: 'knowledge', name: '知识整理', description: '已校对原文的解读、故事与索引候选' },
  { id: 'memory', name: '记忆整理', description: '本人聊天中的长期记忆候选' },
  { id: 'research', name: '深度研究', description: '研究问题、证据分析与方案比较' },
  { id: 'development', name: '项目开发', description: 'Pi 项目执行器的开发轮次' },
  { id: 'background', name: '通用作业', description: '其他有边界的智能整理作业' },
] as const;
export type ModelScenario = typeof modelScenarios[number]['id'];
export const scenarioSchema = z.enum(modelScenarios.map(x => x.id));
export const selectionSchema = z.object({ provider: z.string().trim().min(1).max(100), model: z.string().trim().min(1).max(200) }).strict();
export type ModelSelection = z.infer<typeof selectionSchema>;
export const conversationRoutingSchema=z.object({
  enabled:z.boolean().default(true),
  fast:selectionSchema.nullable().default(null),
  advanced:selectionSchema.nullable().default(null),
  transition:z.boolean().default(true),
  transitionAfterMs:z.number().int().min(0).max(5000).default(700),
  transitionTimeoutMs:z.number().int().min(1000).max(15000).default(8000),
}).strict();
export type ConversationRouting=z.infer<typeof conversationRoutingSchema>;
export const defaultConversationRouting=():ConversationRouting=>conversationRoutingSchema.parse({});
export const priceSchema = z.object({ input: z.number().min(0).max(100000), output: z.number().min(0).max(100000), cacheRead: z.number().min(0).max(100000), cacheWrite: z.number().min(0).max(100000) }).strict();
export type ModelPrice = z.infer<typeof priceSchema>;
export const gatewayDefinitionSchema = z.object({
  id: z.string().regex(/^(superopen|cc-gateway|gateway-[a-z0-9-]{1,60})$/),
  name: z.string().trim().min(1).max(80),
  baseUrl: z.string().max(2000).transform(value => value.replace(/\/+$/, '')).refine(value => {
    try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password && !u.search && !u.hash; } catch { return false; }
  }, '网关地址须为不含账户、参数的 HTTPS 地址'),
  api: z.enum(['anthropic-messages', 'openai-completions']),
}).strict();
export type GatewayDefinition = z.infer<typeof gatewayDefinitionSchema>;
export const presetGateways: GatewayDefinition[] = [
  { id: 'superopen', name: 'SuperOpen 网关', baseUrl: 'https://gw.superopen.top', api: 'anthropic-messages' },
  { id: 'cc-gateway', name: 'IKVein 网关', baseUrl: 'https://cc-gateway.ikvein.com', api: 'anthropic-messages' },
];
export const routingDocumentSchema = z.object({
  revision: z.number().int().min(0),
  gateways: z.array(gatewayDefinitionSchema).max(128),
  routes: z.partialRecord(scenarioSchema, selectionSchema).default({}),
  prices: z.array(z.object({ ...selectionSchema.shape, price: priceSchema }).strict()).max(1000).default([]),
  conversation:conversationRoutingSchema.default(()=>defaultConversationRouting()),
}).strict();
export type RoutingDocument = z.infer<typeof routingDocumentSchema>;
export const emptyRoutingDocument = (): RoutingDocument => ({ revision: 0, gateways: [], routes: {}, prices: [],conversation:defaultConversationRouting() });

export type ResponseLanguage='zh'|'en'|'fr'|'de';
/** Local classification only: no paid classifier, remote query or global model mutation. */
export function conversationComplexity(text:string):{advanced:boolean;reason:'ordinary'|'research'|'comparison'|'high-stakes'|'multi-condition'}{
 const value=text.normalize('NFKC').trim();
 if(/(?:身体不适|症状|用药|剂量|诊断|医疗|手术|法律|诉讼|合同风险|投资|贷款|股票|medical|diagnos|dosage|legal|lawsuit|investment|médical|diagnosti|juridique|droit|investissement|financier|medizin|rechtlich|investition|finanz|versicherung)/i.test(value))return {advanced:true,reason:'high-stakes'};
 if(/(?:深度|深入|全面|详细|严谨|研究|推导|证明|因果|系统性|deep(?:ly)?|in.depth|research|derive|prove|rigorous|analy[sz]|approfond|recherche|démontr|étudi|en.détail|vertieft|recherch|beweis|untersuch|ausführlich|detailliert)/i.test(value))return {advanced:true,reason:'research'};
 if(/(?:比较|对比|权衡|规划|架构|路线|部署|选型|方案|compare|trade.?off|design|architect|plan|comparer|comparaison|planifier|architecture|vergleich|abwägen|entwerf|planung)/i.test(value))return {advanced:true,reason:'comparison'};
 if(value.length>320||value.length>120&&(value.match(/[;；\n]|(?:并且|同时|还要|但是|以及|however|also|and |mais |aussi |und |aber )/gi)?.length??0)>=3)return {advanced:true,reason:'multi-condition'};
 return {advanced:false,reason:'ordinary'};
}
/** The server has already resolved this turn's policy; a practice target never replaces it. */
export function responseLanguageInstruction(language?:ResponseLanguage):string{
 const explicit={
  zh:'本轮用自然中文回应。服务端冻结的回复语种适用于问候、教师讲解、纠错说明与反馈、确认、控制提示、等待语和最终答复；优先于原话、识别语种、历史回复、个人偏好的旧language字段和技能中的学习语言。用户要求练习英语、法语或德语不等于切换讲解语言：仍用中文问候和讲解。目标语只可用于明确标识的简短练习例句或必要原文引用；不得让目标语成为整段主文。结构化练习中承载目标语样例的question、correction、modelAnswer和nextQuestion字段仍用练习目标语，translation、feedback和guide解释遵守本轮回复语种。不要更改JSON键、标识符、专名、工具或权限。',
  en:'Respond in natural English for this turn. This server-selected reply language governs every greeting, teacher explanation, correction explanation or feedback, confirmation, control instruction, waiting acknowledgement and final answer. It takes precedence over the input or ASR language, earlier replies, the legacy profile language field and any skill learning-language instruction. A request to practice French, German or another language does not switch the teacher to that language: greet and explain in English. Use the practice target only in clearly labelled short exercise examples or necessary original quotations; never make it the main response language. In structured practice, question, correction, modelAnswer and nextQuestion fields that hold target-language exercise samples remain in the practice target language; translation, feedback and guide explanations follow this reply language. Preserve JSON keys, identifiers, proper names, tools and permissions.',
  fr:'Répondez en français naturel pour cet échange. Cette langue de réponse fixée par le serveur régit chaque salutation, explication pédagogique, explication des corrections, confirmation, instruction de contrôle, message d’attente et réponse finale. Elle prévaut sur la langue saisie ou reconnue, les réponses précédentes, l’ancien champ language du profil et les consignes linguistiques des compétences. Demander de pratiquer l’anglais, l’allemand ou une autre langue ne change pas la langue du professeur : saluez et expliquez en français. La langue étudiée est réservée aux courts exemples explicitement présentés comme exercices ou aux citations originales nécessaires ; elle ne doit pas devenir la langue principale de la réponse. Dans les exercices structurés, les champs question, correction, modelAnswer et nextQuestion contenant des exemples conservent la langue étudiée ; les explications translation, feedback et guide suivent cette langue de réponse. Conservez les clés JSON, identifiants, noms propres, outils et autorisations.',
  de:'Antworte in diesem Gespräch auf natürlichem Deutsch. Diese vom Server festgelegte Antwortsprache gilt für jede Begrüßung, Lehrererklärung, Korrekturerklärung, Rückmeldung, Bestätigung, Steuerungsanweisung, Wartebestätigung und endgültige Antwort. Sie hat Vorrang vor der Eingabe- oder ASR-Sprache, früheren Antworten, dem alten Profilfeld language und Sprachlernanweisungen einer Fähigkeit. Der Wunsch, Französisch, Englisch oder eine andere Sprache zu üben, wechselt nicht die Sprache des Lehrers: Begrüßung und Erklärung bleiben auf Deutsch. Die Zielsprache darf nur in ausdrücklich gekennzeichneten kurzen Übungsbeispielen oder notwendigen Originalzitaten stehen; sie darf nicht zur Hauptsprache der Antwort werden. In strukturierten Übungen bleiben die Beispiel-Felder question, correction, modelAnswer und nextQuestion in der Zielsprache; Erläuterungen in translation, feedback und guide folgen dieser Antwortsprache. JSON-Schlüssel, Kennungen, Eigennamen, Werkzeuge und Berechtigungen bleiben unverändert.'
 };
 return language?`[SERVER_FROZEN_REPLY_LANGUAGE=${language}]\n${explicit[language]}`:'优先用用户本轮原话的语言自然回应。学习目标语言与教师讲解语言分别处理；目标语只用于明确标识的简短练习例句，不覆盖服务端已指定的回复语种。无法确定语言时用中文。';
}
export function transitionPhrases(language:ResponseLanguage='zh'):readonly string[]{return {
 zh:['我在，稍等一下。','好的，我认真核对一下。','我会把关键点理清楚。'],
 en:['I’m here. One moment.','Okay, let me check carefully.','I’ll work through the key points.'],
 fr:['Je suis là. Un instant.','D’accord, je vérifie avec soin.','Je vais examiner les points clés.'],
 de:['Ich bin da. Einen Moment.','Gut, ich prüfe das sorgfältig.','Ich gehe die wichtigsten Punkte durch.'],
 }[language];}
export function inferredResponseLanguage(text:string,explicit?:ResponseLanguage):ResponseLanguage{
 if(explicit)return explicit;if(/[\u3400-\u9fff]/.test(text))return 'zh';
 if(/\b(?:bonjour|salut|merci|pourquoi|comment|pourriez|français|aujourd'hui|je suis|qu'est)\b/i.test(text))return 'fr';
 if(/\b(?:hallo|danke|warum|deutsch|bitte|kannst|können|wie geht|ich bin|vergleichen)\b/i.test(text))return 'de';
 return /[A-Za-z]/.test(text)?'en':'zh';
}
