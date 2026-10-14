/** Read-only local deployment check. Never reads credentials, decrypts keys or starts AI jobs. */
import {DatabaseSync} from 'node:sqlite';
import {writeFile,mkdir,stat} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const directory=resolve(process.env.JARVIS_DATA_DIR??join(root,'.jarvis'));
const base=process.env.JARVIS_INSPECT_URL??'http://127.0.0.1:3140';
const expected=process.env.JARVIS_EXPECT_BUILD??'20261006-prepared';
const request=async path=>fetch(new URL(path,base),{signal:AbortSignal.timeout(10000),redirect:'error'});
const healthResponse=await request('/api/health');assert.equal(healthResponse.status,200);
const health=await healthResponse.json();assert.equal(health.status,'ok');assert.equal(health.build,expected);
const entry=await request('/?mode=platform');assert.equal(entry.status,200);assert.match(await entry.text(),/id="root"/);
const protectedStatuses={};
for(const path of ['/api/v1/capabilities','/api/runtime/governance','/api/runtime/governance/billing/imports','/api/runtime/governance/billing/summary','/api/v1/execution/observations','/api/v1/execution/config','/api/runtime/notifications','/api/runtime/notifications/preferences','/api/runtime/family/weather/preferences','/api/runtime/weather/settings','/api/runtime/family/companion/sessions','/api/v1/execution/monitoring?kind=machine&id=central&window=1h&points=20']){
 const response=await request(path);protectedStatuses[path]=response.status;assert.equal(response.status,401,'Administrator route must require login');
}
const authState=await (await request('/api/auth/state')).json();
const db=new DatabaseSync(join(directory,'jarvis.db'),{readOnly:true});
let database;
try{
 const tableExists=name=>!!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(name);
 const count=(name,where='')=>tableExists(name)?Number(db.prepare(`SELECT COUNT(*) AS n FROM ${name} ${where}`).get().n):null;
 database={
  integrity:db.prepare('PRAGMA quick_check').get().quick_check,
  voiceEngineKinds:tableExists('runtime_voice_engines')?db.prepare('SELECT kind FROM runtime_voice_engines ORDER BY kind').all().map(r=>r.kind):[],
  memberCredentials:count('runtime_member_credentials'),
  voiceJobs:count('runtime_voice_jobs'),
  aiActiveRuns:count('runtime_ai_runs',"WHERE state='active'"),
  unknownUsageRuns:count('runtime_ai_unreported'),
  memoryOperations:count('v1_documents',"WHERE domain='operations' AND json_extract(json,'$.kind')='memory-execution'"),
  voiceIntentProposals:count('runtime_voice_intents'),
  notificationReminders:count('runtime_notification_reminders'),
  notificationDeliveries:count('runtime_notification_deliveries'),
  weatherSelectedCities:count('runtime_weather_preferences','WHERE location IS NOT NULL'),
  companionSessions:count('runtime_companion_sessions'),
  companionReceipts:count('runtime_companion_receipts'),
  importedBills:count('runtime_billing_documents'),
  billLinks:count('runtime_billing_links')
 };
 assert.equal(database.integrity,'ok');
}finally{db.close();}
const executionDb=new DatabaseSync(join(directory,'execution','execution.sqlite'),{readOnly:true});
try{
 database.executionIntegrity=executionDb.prepare('PRAGMA quick_check').get().quick_check;
 assert.equal(database.executionIntegrity,'ok');
 const hasRaw=executionDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='execution_monitor_raw'").get();
 database.monitorSamples=hasRaw?executionDb.prepare('SELECT kind,source,COUNT(*) AS samples FROM execution_monitor_raw GROUP BY kind,source').all():[];
 const hasObservations=executionDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='execution_observation_config'").get();
 const observations=hasObservations?executionDb.prepare('SELECT json FROM execution_observation_config WHERE id=1').get():null;
 const config=observations?JSON.parse(observations.json):{logSources:[],hardwareSources:[]};
 database.configuredLogSources=config.logSources.length;database.configuredHardwareSources=config.hardwareSources.length;
 const hasLogs=executionDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='execution_service_logs'").get();
 database.rawServiceLogs=hasLogs?Number(executionDb.prepare('SELECT COUNT(*) AS n FROM execution_service_logs').get().n):null;
}finally{executionDb.close();}
const key=join(directory,'runtime','voice-master.key'),model=join(directory,'runtime','models','whisper-tiny');
const report={at:new Date().toISOString(),status:'passed',health,administratorSetupPresent:!authState.setupRequired,protectedStatuses,database,
 localFiles:{python:existsSync(join(root,'.runtime-venv',process.platform==='win32'?'Scripts/python.exe':'bin/python')),voiceKeyPresent:existsSync(key),voiceKeyLength:existsSync(key)?(await stat(key)).size:null,whisperModelFiles:['model.bin','config.json','tokenizer.json','vocabulary.txt','jarvis-download-manifest.json'].every(name=>existsSync(join(model,name))),executionDatabase:existsSync(join(directory,'execution','execution.sqlite'))},
 requestsWereReadOnly:true,modelCalls:0,microphoneCalls:0,speakerCalls:0,remoteMachineActions:0,
 fieldValidationPending:['48GB deployment and HTTPS','room acoustic testing','configured external model and execution node acceptance']};
const output=resolve(process.argv[2]??join(root,'artifacts','complete-backend-qa','local-runtime.json'));
await mkdir(dirname(output),{recursive:true});await writeFile(output,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({status:report.status,build:health.build,voiceEngines:database.voiceEngineKinds,output}));
