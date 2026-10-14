/** Production installer control-flow tests with injected read-only host/platform
 * adapters and a fixture renderer. They perform no remote or model operations. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {SourceTextModule,SyntheticModule,createContext} from 'node:vm';
import {repairScope as S,sha} from './run-factory-main-repair-r26.mjs';
import {r28VerifierScope as V} from './prepare-factory-verifier-r28.mjs';
import {r28InstallScope as I,r28RecordOnlyBaseTemplateSHA256 as baseSHA} from './install-factory-verifier-r28.mjs';
const source=await readFile(new URL('./install-factory-verifier-r28.mjs',import.meta.url),'utf8');
const clone=v=>structuredClone(v),hash='1'.repeat(64),fp='2'.repeat(64),meta='3'.repeat(64);
let privateBase=null,privateRetired=null;
try{const saved=JSON.parse(await readFile(new URL('../.jarvis-dev/maintenance/factory-base-record-only-r27.json',import.meta.url),'utf8'));assert.equal(sha(saved.replacement),baseSHA);privateBase=saved.replacement;privateRetired=saved.original;}catch(e){if(e.code!=='ENOENT')throw e;}
const syntheticBase={id:S.templateId,machineId:S.machineId,engine:'claude',program:'/original',supervision:{billing:'record-only'}};
async function fixture({installationState='absent',attempted=true,journalPresent=true,templateOverride=null,allowInstall=false}={}){
 const captureBase=privateBase??syntheticBase,template=templateOverride??(journalPresent?syntheticBase:captureBase);
 const fixtureSource=privateBase||journalPresent?source:source.replace("export const r28RecordOnlyBaseTemplateSHA256='"+baseSHA+"'", "export const r28RecordOnlyBaseTemplateSHA256='"+sha(captureBase)+"'");
 const profile={goalSpecHash:S.goalSHA,config:{costPolicy:'record-only'},fixtureOnly:true};
 const preparation={sourceObservation:{candidateFingerprint:fp,candidateMetadataSHA256:meta}},prepared={manifest:preparation,wrapper:Buffer.from('fixture wrapper'),collector:Buffer.from('fixture collector'),config:{baseline:{},policy:{}}};
 const inputRaw=JSON.stringify({schemaVersion:1,kind:'software-factory-r28-verifier-input',baselineBase64:Buffer.from('{}').toString('base64'),policyBase64:Buffer.from('{}').toString('base64'),sourceObservation:preparation.sourceObservation});
 const context=createContext({Buffer,Date,process:{argv:[]}}),modules=new Map(),module=new SourceTextModule(fixtureSource,{context,identifier:'r28-installer-readonly-flow',initializeImportMeta(meta){meta.url=new URL('./install-factory-verifier-r28.mjs',import.meta.url).href;}});
 await module.link(async name=>{if(modules.has(name))return modules.get(name);const actual=await import(name.startsWith('node:')?name:new URL(name,import.meta.url).href),exports={...actual};if(name==='./sync-factory-repair-plan-r28.mjs')exports.r28MetadataScope={...actual.r28MetadataScope,profileSHA256:sha(profile)};if(name==='./prepare-factory-verifier-r28.mjs')exports.prepareR28Verifier=()=>prepared;const m=new SyntheticModule(Object.keys(exports),function(){for(const [k,v]of Object.entries(exports))this.setExport(k,v);},{context});modules.set(name,m);return m;});await module.evaluate();
 const expectedInstalled={wrapperSHA256:hash,collectorSHA256:hash,baselineSHA256:hash,policySHA256:hash,sudoRuleSHA256:hash};
 const oldHost={source:{stable:true,sha256:S.baselineSHA,files:593,metadataSHA:'f9a218fbffab9df21d05717978d8ad4d0baa63bf2c69f9f3a81e6e702711f626'},oldCandidate:{stable:true,sha256:'66a56a19ce783c020ed211d7c6a2b620f1767783cd9c58525df3ca33dc0ce246',files:605,metadataSHA:'627d3db589bc56dbbdd1fc2510cc738f78297551d8ecc12648a80fd081bdc1d0'},candidate:{stable:true,sha256:fp,files:610,metadataSHA:meta},oldImmutable:{frozen:hash},nodeTemplates:{otherTemplatesSHA256:hash},installed:null};
 const liveHost={...clone(oldHost),installed:installationState==='complete'?clone(expectedInstalled):installationState==='partial'?{partial:true,hashes:{wrapperSHA256:hash}}:null},payload={expectedInstalled};
 const journal={version:1,scope:I,installJob:'4'.repeat(32),inputSHA256:sha(inputRaw),preparationSHA256:sha(preparation),before:{targetTemplateSHA256:sha(template),otherCentralTemplatesSHA256:sha([]),host:oldHost},payload,phase:attempted?'install-attempted':'prepared',...(attempted?{installAttemptedAt:'2026-10-12T03:00:00Z'}:{})};
 const calls={api:0,readonlyHost:0,rootMutation:0,journalWrites:0};let captured=null;
 const deps={readLocal:async(path,encoding)=>{if(path===V.inputPath)return inputRaw;if(path===I.journalPath){if(journalPresent)return JSON.stringify(journal);throw Object.assign(Error('fixture journal absent'),{code:'ENOENT'});}return encoding?'fixture renderer input':Buffer.from('fixture renderer input');},api:async path=>{calls.api++;if(path.endsWith('/autonomy'))return {data:profile};if(path==='/api/v1/execution/supervision')return {data:{supervised:false,stopped:false}};if(path==='/api/v1/execution/config')return {data:{templates:[template]}};throw Error('unexpected fixture API');},nodeState:async()=>({agentId:'0b5aea06-47e1-4f4b-a32e-969417915c9c',template,unit:{ActiveState:'active'}}),queueState:async()=>({readOnly:true,fullTable:true,allActive:0}),hostReadParams:()=>({readonly:true}),assertHostObservation:host=>host,r28HostReadProgram:()=> 'readonly-host',r28InstallProgram:()=> 'mutating-install',readRoot:async(params,program)=>{if(program!=='readonly-host'){calls.rootMutation++;if(!allowInstall)throw Error('unexpected install mutation');liveHost.installed=clone(expectedInstalled);liveHost.visudoVerified=true;return {installed:true,visudoVerified:true};}calls.readonlyHost++;return clone(liveHost);},buildR28InstallPayload:()=>payload,saveJournal:async value=>{calls.journalWrites++;captured=clone(value);}};
 return {calls,get captured(){return captured;},run:action=>module.namespace.installFactoryVerifierR28({action},deps)};
}
test('production inspect reports uncertain attempted installation absent as not-ready and requires reconciliation',async()=>{
 const f=await fixture(),result=await f.run('inspect');assert.equal(result.installationState,'absent');assert.equal(result.ready,false);assert.equal(result.reconciliationRequired,true);assert.equal(result.reason,'R28_INSTALL_UNCERTAIN_ABSENT_RECONCILIATION_REQUIRED');assert.equal(result.installed,false);assert.equal(result.remoteMutationsPerformed,false);assert.equal(f.calls.readonlyHost,1);assert.equal(f.calls.rootMutation,0);assert.equal(f.calls.journalWrites,0);
 await assert.rejects(f.run('install'),/R28_INSTALL_UNCERTAIN_ABSENT_RECONCILIATION_REQUIRED/);assert.equal(f.calls.rootMutation,0);assert.equal(f.calls.journalWrites,0);
});
test('production inspect keeps fresh absent and exactly complete states ready while partial remains read-only',async()=>{
 for(const [installationState,attempted,ready,reconciliationRequired]of [['absent',false,true,false],['complete',true,true,false],['partial',true,false,true]]){const f=await fixture({installationState,attempted}),result=await f.run('inspect');assert.equal(result.installationState,installationState);assert.equal(result.ready,ready);assert.equal(result.reconciliationRequired,reconciliationRequired);assert.equal(result.installed,installationState==='complete');assert.equal(f.calls.rootMutation,0);assert.equal(f.calls.journalWrites,0);if(installationState==='partial')assert.equal(result.reason,'R28_INSTALL_PARTIAL_INSTALLATION_READ_ONLY_RECONCILIATION_REQUIRED');}
});
test('equal central and node retired priced base cannot become a new installation restoration point',async()=>{
 const retired=privateRetired??{...syntheticBase,supervision:{billing:'priced'},args:['--max-budget-usd','1']};
 if(privateRetired)assert.equal(sha(retired),'57c019fef72d6be11f0f37d13a4be1b07a67b6458bb1934d2979718a831c131e');
 for(const action of ['inspect','install']){const f=await fixture({journalPresent:false,templateOverride:retired});await assert.rejects(f.run(action),/R28_INSTALL_INITIAL_RECORD_ONLY_BASE_TEMPLATE_REQUIRED/);assert.equal(f.calls.rootMutation,0);assert.equal(f.calls.journalWrites,0);assert.equal(f.captured,null);}
});
test('actual private record-only 9c base is newly captured and old journal stays authoritative',{skip:privateBase===null},async()=>{
 const f=await fixture({journalPresent:false,allowInstall:true}),result=await f.run('install');assert.equal(result.installed,true);assert.equal(f.captured.before.targetTemplateSHA256,baseSHA);assert.equal(f.captured.phase,'installed');assert.equal(f.calls.rootMutation,1);
 // Existing saved intents are not rebound to the newly required baseline.
 const prior=await fixture({journalPresent:true,attempted:true,installationState:'absent'}),view=await prior.run('inspect');assert.equal(view.reconciliationRequired,true);assert.equal(prior.calls.journalWrites,0);assert.equal(prior.calls.rootMutation,0);
});
