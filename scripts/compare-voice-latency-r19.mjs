/** Compare retained synthetic metadata only. This script never contacts a server or calls a model. */
import assert from 'node:assert/strict';
import {readFile,readdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';

const folder='artifacts/voice-latency-r19';
const load=async name=>JSON.parse(await readFile(folder+'/'+name,'utf8'));
const beforeName='before-attempt4.json';
const afterName=process.argv.find(x=>x.startsWith('--after='))?.slice(8)??'after.json';
assert(/^after(?:-attempt[1-9]\d?)?\.json$/.test(afterName),'AFTER_REPORT_NAME_INVALID');
const [before,after,threads,local,failed]=await Promise.all([
 load(beforeName),load(afterName),load('threads-deployment.json'),load('local-verification.json'),load('attempt3-ledger-readback.json')
]);
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const benchmarkHash=hash(await readFile('scripts/benchmark-voice-latency-r19.mjs'));
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const finite=x=>typeof x==='number'&&Number.isFinite(x);
const metric=(a,b)=>({beforeMs:a??null,afterMs:b??null,
 changePercent:finite(a)&&a>0&&finite(b)?Math.round((b-a)/a*10000)/100:null,
 convention:'negative change means faster',
 ...(a===null&&finite(b)?{change:'new approved incremental sentence; no valid percentage baseline'}:{})});
const metrics=['asrMs','asrInferenceMs','firstDeltaMs','firstApprovedSentenceMs','doneMs','firstFinalAudioReadyMs','ttsMs'];
const comparisons=before.samples.map(a=>{
 const b=after.samples.find(x=>x.fixture===a.fixture);
 assert(b,'AFTER_FIXTURE_MISSING');
 return {fixture:a.fixture,inputLanguage:a.inputLanguage,
  timings:Object.fromEntries(metrics.map(key=>[key,metric(a[key],b[key])])),
  before:{route:a.route,speechMode:a.speechMode,speechCount:a.speechCount,ttsModel:a.ttsModel,ttsLanguage:a.ttsLanguage,firstSentenceChars:a.firstSentenceChars,answerChars:a.answerChars,detectedLanguage:a.detectedLanguage},
  after:{route:b.route,speechMode:b.speechMode,speechCount:b.speechCount,ttsModel:b.ttsModel,ttsLanguage:b.ttsLanguage,firstSentenceChars:b.firstSentenceChars,answerChars:b.answerChars,detectedLanguage:b.detectedLanguage},
  correctAutomaticLanguage:a.detectedLanguage===a.inputLanguage&&b.detectedLanguage===b.inputLanguage,
  sameRoute:same(a.route,b.route),sameAsrModel:a.asrModel===b.asrModel,
  sameReplyVoice:a.ttsModel===b.ttsModel&&a.ttsLanguage===b.ttsLanguage,
  beforeToolCalls:a.toolCalls,afterToolCalls:b.toolCalls,
  scope:'One synthetic request per fixture per release; ASR lexical accuracy and phone playback are not measured here'
 };
});
const verifications={
 bothMeasurementsPassed:before.status==='passed'&&after.status==='passed',
 sameBenchmarkCode:local.files.find(x=>x.path==='scripts/benchmark-voice-latency-r19.mjs')?.sha256===benchmarkHash,
 sameFixtureIds:same(before.samples.map(x=>x.fixture),after.samples.map(x=>x.fixture)),
 sameRouting:same(before.routing,after.routing)&&before.routingRevision===after.routingRevision&&comparisons.every(x=>x.sameRoute),
 sameVoiceAndReplyPolicy:same(before.voice,after.voice)&&before.replyPolicy===after.replyPolicy&&comparisons.every(x=>x.sameReplyVoice&&x.sameAsrModel),
 automaticInputLanguages:comparisons.every(x=>x.correctAutomaticLanguage),
 productionRelease:after.build==='20261010-autonomous-voice-r19-1',
 residentThreadsDeployed:threads.deployed===true&&threads.unitActive===true&&threads.actualProcessThreads===4&&threads.otherParametersUnchanged===true,
 realServiceSyntheticScope:before.directEngine===true&&after.directEngine===true&&before.physicalMicrophoneOrSpeaker===false&&after.physicalMicrophoneOrSpeaker===false,
 maintenanceSessionsRevoked:before.maintenanceSessionRevoked===true&&after.maintenanceSessionRevoked===true,
 syntheticConversationsRemoved:before.syntheticConversationsRemoved===before.modelRequests&&after.syntheticConversationsRemoved===after.modelRequests,
 noCleanupErrors:before.cleanupErrors?.length===0&&after.cleanupErrors?.length===0
};
const attempts=[];
for(const name of (await readdir(folder)).filter(x=>/^(?:before|after)(?:-attempt[1-9]\d?)?\.json$/.test(x)).sort()){
 const report=await load(name),calls=(report.samples??[]).flatMap(x=>x.usage??[]);
 const reported=calls.filter(x=>x.usage&&finite(x.usage.totalTokens));
 attempts.push({file:name,phase:report.phase,status:report.status,modelRequests:report.modelRequests??0,
  nativeReceiptCalls:reported.length,nativeReceiptTokens:reported.reduce((n,x)=>n+x.usage.totalTokens,0),
  usage:reported.map(x=>({provider:x.provider,model:x.model,...x.usage})),
  failure:report.failure??null,failureStage:report.failureStage??null,
  attribution:reported.length===(report.modelRequests??0)?'native SDK receipts for scoped synthetic conversations':'incomplete local receipt; failed baseline has separate bounded ledger readback'});
}
const ledgerTokens=failed.rows.reduce((n,x)=>n+(finite(x.totalTokens)?x.totalTokens:0),0);
const nativeTokens=attempts.reduce((n,x)=>n+x.nativeReceiptTokens,0);
const beforeAttempts=attempts.filter(x=>x.phase==='before'),afterAttempts=attempts.filter(x=>x.phase==='after');
const references=[beforeName,afterName,'threads-deployment.json','asr-threads-attempt4.json','attempt3-ledger-readback.json','local-verification.json'];
const referenceHashes={};for(const name of references)referenceHashes[name]=hash(await readFile(folder+'/'+name));
const result={at:new Date().toISOString(),verified:Object.values(verifications).every(Boolean),
 verifiedMeaning:'Same synthetic fixtures, routes, voice policies and actual released service scope; this is not phone field acceptance',
 verifications,before:{report:beforeName,build:before.build,startedAt:before.startedAt,completedAt:before.completedAt,routingRevision:before.routingRevision,threads:threads.threadsBefore},
 after:{report:afterName,build:after.build,startedAt:after.startedAt,completedAt:after.completedAt,routingRevision:after.routingRevision,threads:threads.actualProcessThreads},
 threads:{unit:threads.unit,beforeSHA256:threads.beforeSHA256,afterSHA256:threads.afterSHA256,actualProcessThreads:threads.actualProcessThreads,preferencesChanged:threads.memberPreferencesChanged,beamSizeChanged:threads.beamSizeChanged},
 comparisons,
 accounting:{beforeModelRequests:beforeAttempts.reduce((n,x)=>n+x.modelRequests,0),afterModelRequests:afterAttempts.reduce((n,x)=>n+x.modelRequests,0),
  modelRequests:attempts.reduce((n,x)=>n+x.modelRequests,0),nativeReceiptTokens:nativeTokens,
  failedBaselineBoundedLedgerTokens:ledgerTokens,recordedTokenSum:nativeTokens+ledgerTokens,
  failedBaselineAttribution:failed.attribution,failedBaselineExactConversationRetained:false,
  failedBaselineLedgerRunCount:failed.uniqueRunCount,failedBaselineMeasurementStatus:failed.rows.map(x=>x.measurementStatus),
  costUSD:null,costKind:'unavailable',pricesConfiguredBefore:before.priceConfigured,pricesConfiguredAfter:after.priceConfigured,
  priceOrMissingUsageEstimated:false,modelCallsByComparisonScript:0,attempts},
 scope:{actualFamilySse:true,actualResidentAsrTts:true,synthetic:true,physicalMicrophoneOrSpeaker:false,phoneFieldAcceptance:false,
  clientAudioSchedulerEndToEnd:false,asrLexicalAccuracyMeasured:false,answerFactualAccuracyIndependentlyReviewed:false,quietHourPreferencesChanged:false,
  numberOfSuccessfulFixturesPerRelease:2,repeatRunsForStatistics:0},
 limits:[
  'First audio ready includes synthesis and SSH transfer; it does not prove when a phone speaker begins playback.',
  'The old final-mode baseline extracts a first sentence after done for the synthesis probe; it is not a full old RoomVoice rendering benchmark.',
  'One observation per fixture is sensitive to gateway and CPU variation. Percentages are observed changes, not future response-time guarantees.',
  'Generated answers and first sentence lengths can differ; TTS changes cannot be attributed to CPU sizing alone.',
  'ASR timings and SSE timings use separate clocks: SSE begins at the text request after ASR.',
  'The 2→4 CPU-thread experiment independently retained exact synthetic English/French transcript equality; this conversation benchmark retains language and timing only.',
  'The third failed baseline request is recovered from one native usage row in a bounded time window. Its original probe report did not retain the conversation ID.',
  'Costs remain unknown without a gateway price configuration; recorded native token counts are not invented or removed.'
 ],referenceHashes,benchmarkSHA256:benchmarkHash};
await writeFile(folder+'/after-comparison.json',JSON.stringify(result,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({verified:result.verified,beforeBuild:before.build,afterBuild:after.build,fixtures:comparisons.map(x=>({fixture:x.fixture,timings:x.timings})),modelRequests:result.accounting.modelRequests,recordedTokenSum:result.accounting.recordedTokenSum,costKind:'unavailable',phoneFieldAcceptance:false}));
if(!result.verified)process.exitCode=1;
