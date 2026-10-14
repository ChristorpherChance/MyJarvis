/** Fixed candidate report reader. It never dispatches or executes product code. */
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {evidenceScope as E,loadEvidenceContext,readBoundExecution,observePlatform,hostParameters,hostReadProgram,assertEvidenceHost,bindTerminalReport,ensureObservationUnchanged,publicTerminal,publicValidationMetadata,parseReadArguments,withEvidencePlatform,safeEvidenceFailure,savePublicEvidence} from './factory-repair-evidence-read-r26.mjs';

export async function readRepairAcceptance(options={},d){
 const context=await (d.loadContext??loadEvidenceContext)(options,d),snapshot=await readBoundExecution(context,d),platform=await observePlatform(context,d);
 const host=assertEvidenceHost(await d.readRoot(hostParameters(context,options),hostReadProgram()),context,platform);
 const bound=bindTerminalReport(snapshot,host);await ensureObservationUnchanged(context,snapshot,platform,d);
 return {schemaVersion:1,kind:'software-factory-repair-candidate-fixed-report-readback',observedAt:new Date(d.now()).toISOString(),projectId:E.projectId,taskId:context.j.taskId,runId:context.j.runId,workspace:E.workspace,sourceRole:'independent-native-repair-candidate',candidateFingerprint:E.candidateFingerprint,mainFingerprint:E.mainFingerprint,partialNative:context.j.nativeBinding.partialNative,terminal:publicTerminal(snapshot),signedReport:publicValidationMetadata(snapshot,host),terminalReportBinding:bound,attempts:host.attempts,source:{mainBefore:context.j.mainBefore,mainAfter:host.source,candidateBefore:context.j.candidateBefore,candidateAfter:host.candidate,mainUnchanged:true,candidateUnchanged:true,verificationScope:'public-manifest-and-metadata'},node:{agentId:context.j.nodeAgentId,queueActive:platform.queueActive,acknowledgementCounts:host.quiet.counts,childCount:host.quiet.children.length},executorRestored:context.j.restored===true,oldProfileUnchanged:true,otherTemplatesUnchanged:true,oldEvidenceUnchanged:true,independentCleanupAuditRequired:true,readOnly:true,privateEnvironmentExported:false,rawLogsExported:false,rawResultExported:false,productCodeExecuted:false,modelsInvoked:false,productAccepted:false,objectivesAccepted:false};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 let result;try{const options=parseReadArguments(process.argv.slice(2));result=await withEvidencePlatform(d=>readRepairAcceptance(options,d));}catch(error){result=safeEvidenceFailure(error,'software-factory-repair-candidate-fixed-report-readback');process.exitCode=1;}
 const receipt=await savePublicEvidence('repair-full-readback-r26',result);console.log(JSON.stringify({...receipt,...result}));
}
