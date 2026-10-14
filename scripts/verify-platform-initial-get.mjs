/**
 * Read-only production probes for the 25 initial LiveProvider GETs.
 * node scripts/verify-platform-initial-get.mjs --execute [--release=20261010-voice-web-r16-1]
 * Reports contain endpoint/status/anonymous validation paths only. Response records stay in RAM.
 */
import assert from 'node:assert/strict';
import {mkdir, writeFile} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {withPlatform} from './managed-server-client.mjs';

const domains = ['inbox','research','projects','tasks','experiences','family','memory','personas','sources','books','stories','learning','machines','services','operations','approvals','settings','voice','jobs'];
export const initialPaths = [
  '/api/v1/events/history?afterSequence=0&limit=100&excludeObservations=true',
  ...domains.map(domain => '/api/v1/'+(['sources','books','stories'].includes(domain)?'knowledge/':'')+domain+'?limit=50'),
  '/api/v1/releases?limit=100',
  '/api/v1/capture-policies?limit=100',
  '/api/v1/capabilities',
  '/api/bootstrap',
  '/api/audit',
];
assert.equal(initialPaths.length,25);
assert.equal(new Set(initialPaths).size,25);

function anonymousPath(value) {
  if (typeof value !== 'string' || value.length > 400 || !/^(?:\/[A-Za-z0-9_~.-]+)*$/.test(value)) return '[unavailable]';
  return value.replace(/\/[0-9]+(?=\/|$)/g,'/*').replace(/\/[0-9a-f]{8}-[0-9a-f-]{27,}(?=\/|$)/gi,'/[id]');
}

/** Never return error messages, response values, IDs, URLs, or the original exception. */
export function summarizeFailure(error) {
  const match = String(error?.message ?? '').match(/^API_(\d{3}) (.*)$/s);
  if (!match) return {success:false,httpStatus:0,code:'REQUEST_FAILED',fields:[]};
  let body;
  try {body=JSON.parse(match[2]);} catch {return {success:false,httpStatus:Number(match[1]),code:'INVALID_RESPONSE',fields:[]};}
  const failure=body?.error ?? body;
  const code=typeof failure?.code==='string'&&/^[A-Z][A-Z0-9_]{0,79}$/.test(failure.code)?failure.code:'HTTP_ERROR';
  const fields=Array.isArray(failure?.details?.fields)?failure.details.fields.slice(0,8).map(field=>({path:anonymousPath(field?.path),rule:typeof field?.rule==='string'&&/^[A-Za-z]{1,60}$/.test(field.rule)?field.rule:'unknown'})):[];
  return {success:false,httpStatus:Number(match[1]),code,fields};
}

export async function checkInitialGet(api) {
  return Promise.all(initialPaths.map(async endpoint=>{
    try {await api(endpoint);return {endpoint,success:true,httpStatus:200};}
    catch(error) {return {endpoint,...summarizeFailure(error)};}
  }));
}

async function main() {
  if (!process.argv.includes('--execute')) {
    console.log('Prepared: 25 initial GETs. Requires --execute after the release is online; no connection was made.');
    return;
  }
  const releaseArgument=process.argv.find(value=>value.startsWith('--release='))?.slice(10);
  const release=releaseArgument&&/^[A-Za-z0-9._-]{1,100}$/.test(releaseArgument)?releaseArgument:'20261010-voice-web-r16-1';
  const target=resolve('artifacts/platform-initial-get/published-report.json');
  const startedAt=new Date().toISOString();
  let checks=[],build,maintenanceLoginRevoked=false,verificationFailure;
  try {
    // Reuse pinned TLS/SSH access and its RAM-only, automatically revoked maintenance login.
    const result=await withPlatform(async({api})=>{
      const health=await api('/api/health');
      const build=typeof health?.build==='string'&&/^[A-Za-z0-9._-]{1,100}$/.test(health.build)?health.build:undefined;
      if(health?.status!=='ok'||build!==release)return {build,checks:[],verificationFailure:'EXPECTED_BUILD_NOT_ONLINE'};
      return {build,checks:await checkInitialGet(api)};
    });
    ({checks,build,verificationFailure}=result);
    maintenanceLoginRevoked=true;
  } catch {
    // The helper can fail while connecting or revoking; never serialize its exception.
    verificationFailure='MAINTENANCE_OR_CLEANUP_FAILED';
  }
  const passed=checks.length===25&&checks.every(check=>check.success)&&maintenanceLoginRevoked&&!verificationFailure;
  const report={startedAt,completedAt:new Date().toISOString(),status:passed?'passed':'failed',release,build,checks,maintenanceLoginRevoked,readOnly:true,configurationWrites:0,responseRecordsStored:false,verificationFailure};
  await mkdir(dirname(target),{recursive:true});
  await writeFile(target,JSON.stringify(report,null,2));
  console.log(JSON.stringify({status:report.status,release,build,checks,maintenanceLoginRevoked,report:target,verificationFailure}));
  if (!passed) process.exitCode=1;
}

if (process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href) await main();
