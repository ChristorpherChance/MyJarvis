import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {join,resolve,sep} from 'node:path';
import {tmpdir} from 'node:os';
import {cliSessionArguments,roundCliUsage,validateCliSupervision,classifyCliFailure} from '../src/runtime/cli-supervision.js';
import {absoluteExecutionPath,executionPathWithin,normalizeExecutionPath} from '../src/runtime/execution-paths.js';
import {executeAgentRounds,parseAgentOutput} from '../src/runtime/agent-runner.js';
import {validateExecutionTemplate} from '../src/runtime/execution-runtime.js';
import type {ExecutionTemplate,ClaimedRun} from '../src/runtime/execution-types.js';

const policy={billing:'subscription' as const,maxTokens:1000,maxRecoveryAttempts:2,retryDelaySec:60,repairValidation:true,fallbackExecutorIds:[]};
const native=(engine:'codex'|'claude'):ExecutionTemplate=>({id:engine,machineId:'node',engine,program:process.execPath,workspaceRoot:resolve('artifacts'),args:engine==='codex'?['exec','--json','--sandbox','workspace-write','--cd','{workspace}','{prompt}']:['--print','{prompt}','--output-format','stream-json','--max-budget-usd','{maxBudgetUSD}','--resume','{sessionId}'],maxRounds:3,timeoutSec:10,leaseSec:30,budgetCurrency:'USD',supervision:policy});

test('exact native session resume preserves flags without selecting another project',()=>{
 const t=native('codex');assert.deepEqual(cliSessionArguments(t,t.args!,'session-123'),['--sandbox','workspace-write','--cd','{workspace}','exec','resume','session-123','--json','{prompt}']);
 const c=native('claude'),args=c.args!.map(a=>a==='{sessionId}'?'':a);const first=cliSessionArguments(c,args);assert.equal(first.includes('--resume'),false);assert.equal(first.includes('--verbose'),true);
 const next=cliSessionArguments(c,args,'session-123');assert.deepEqual(next.slice(-2),['--resume','session-123']);assert.throws(()=>cliSessionArguments(t,t.args!,'../other'),/SESSION_ID/);
 for(const flag of ['--last','--continue','--resume=foreign','--ephemeral'])assert.throws(()=>validateExecutionTemplate({...t,args:[...t.args!,flag]}),/会话/);
 assert.throws(()=>validateCliSupervision({...policy,unlimited:true}),/INVALID/);assert.throws(()=>validateCliSupervision({...policy,inputUSDPerMillion:1}),/BOTH_PRICES/);
});

test('Claude cumulative costs are charged once; missing or regressed baselines remain unpriced',()=>{
 const u={inputTokens:10,outputTokens:20};const a=roundCliUsage('claude',u,'s',1.5,undefined,policy);const b=roundCliUsage('claude',u,'s',2.5,a.checkpoint,policy,'s');assert.equal(a.usage!.costUSD!+b.usage!.costUSD!,2.5);
 assert.equal(roundCliUsage('claude',u,'s',2.5,undefined,policy,'s').usage!.costUSD,undefined);
 const regressed=roundCliUsage('claude',u,'s',1,a.checkpoint,policy,'s');assert.equal(regressed.usage!.costUSD,undefined);assert.equal(regressed.checkpoint!.costUSD,1.5);
 const codex=roundCliUsage('codex',u,'s',undefined,undefined,{...policy,inputUSDPerMillion:2,outputUSDPerMillion:4});assert.equal(codex.usage!.costUSD,.0001);
});

test('native errors and cache tokens are observed even when the process exits zero',()=>{
 const p=parseAgentOutput('claude',[JSON.stringify({type:'result',session_id:'s',is_error:true,errors:['Rate limit reached'],usage:{input_tokens:2,cache_creation_input_tokens:3,cache_read_input_tokens:4,output_tokens:1},total_cost_usd:.1})]);assert.equal(p.failure!.kind,'quota');assert.equal(p.usage!.inputTokens,9);
 assert.equal(classifyCliFailure('login required 401').kind,'authentication');assert.equal(classifyCliFailure('ECONNRESET').kind,'network');assert.equal(classifyCliFailure('Permission denied').kind,'permission');
});

test('Linux controller validates Windows project directories without resolving them locally',()=>{
 assert.equal(absoluteExecutionPath('D:\\Projects'),true);assert.equal(normalizeExecutionPath('D:\\Projects\\demo'),'D:\\Projects\\demo');
 assert.equal(executionPathWithin('D:\\Projects','D:\\Projects\\demo'),true);assert.equal(executionPathWithin('D:\\Projects','D:\\ProjectsOther\\demo'),false);assert.equal(executionPathWithin('D:\\Projects','D:\\Projects\\..\\system'),false);assert.equal(executionPathWithin('/workspaces','D:\\Projects'),false);
 const t=validateExecutionTemplate({...native('codex'),program:'C:\\Tools\\codex.exe',workspaceRoot:'D:\\Projects'});assert.equal(t.workspaceRoot,'D:\\Projects');
});

async function withCli(fn:(root:string,run:ClaimedRun)=>Promise<void>){const dir=await mkdtemp(join(tmpdir(),'jarvis-cli-supervision-')),workspace=join(dir,'project');await mkdir(workspace);const run:ClaimedRun={id:'run',kind:'development',machineId:'node',executorId:'claude',workspace,goal:'implement and verify',criteria:'fixed tests and independent acceptance',maxRounds:3,timeoutSec:10,budgetUSD:10,remainingTokens:1000,leaseToken:'fixture',leaseExpiresAt:new Date(Date.now()+60000).toISOString()};try{await fn(dir,run)}finally{assert.ok(resolve(dir).startsWith(resolve(tmpdir())+sep));await rm(dir,{recursive:true,force:true})}}

test('real isolated native-format process resumes, repairs failed fixed tests and charges cumulative spend correctly',async()=>withCli(async(root,run)=>{
 const cli=join(root,'cli.cjs'),check=join(root,'check.cjs');await writeFile(cli,`const fs=require('node:fs');const n=fs.existsSync('round.txt')?Number(fs.readFileSync('round.txt'))+1:1;fs.writeFileSync('round.txt',String(n));const args=process.argv.slice(2),resume=args.indexOf('--resume');if(n===1&&resume>=0||n>1&&args[resume+1]!=='native-session')process.exit(42);console.log(JSON.stringify({type:'result',session_id:'native-session',usage:{input_tokens:10,output_tokens:5},total_cost_usd:n*.4,result:JSON.stringify({summary:'round '+n,needs_more_work:false,artifacts:['round.txt']})}));`);await writeFile(check,`const fs=require('node:fs');if(Number(fs.readFileSync('round.txt'))<2){console.log('Expected second implementation; first test failed');process.exit(1)}`);
 const template={...native('claude'),args:[cli,...native('claude').args!],validation:{program:process.execPath,args:[check],timeoutSec:10}},logs:string[]=[];
 const result=await executeAgentRounds(template,run,run.workspace,new AbortController().signal,(_c,m)=>logs.push(m),async()=>true);
 assert.equal(result.outcome,'success');assert.equal(result.rounds,2);assert.equal(result.sessionId,'native-session');assert.equal(result.usage!.costUSD,.8);assert.equal(result.validation.exitCode,0);assert.equal(await readFile(join(run.workspace,'round.txt'),'utf8'),'2');assert.ok(logs.some(x=>x.includes('继续修复')));
}));

test('subscription token boundary, disabled supervision and missing native receipts stop continuation',async()=>withCli(async(root,run)=>{
 const cli=join(root,'codex.cjs');await writeFile(cli,`console.log(JSON.stringify({type:'thread.started',thread_id:'codex-session'}));console.log(JSON.stringify({type:'item.completed',item:{type:'agent_message',text:JSON.stringify({summary:'more work',needs_more_work:true})}}));console.log(JSON.stringify({type:'turn.completed',usage:{input_tokens:500,output_tokens:100}}));`);const template={...native('codex'),args:[cli,...native('codex').args!]};
 const bounded=await executeAgentRounds(template,run,run.workspace,new AbortController().signal,()=>{},async()=>true);assert.equal(bounded.rounds,2);assert.equal(bounded.outcome,'round-limit');assert.equal(bounded.usage!.inputTokens+bounded.usage!.outputTokens,1200);assert.equal(bounded.usage!.costUSD,undefined);
 const paused=await executeAgentRounds(template,run,run.workspace,new AbortController().signal,()=>{},async()=>false);assert.equal(paused.rounds,1);assert.equal(paused.outcome,'round-limit');
 const missing=join(root,'missing.cjs');await writeFile(missing,"console.log('not a native result')");const bad=await executeAgentRounds({...template,args:[missing,'exec','--json','--sandbox','workspace-write','{prompt}']},run,run.workspace,new AbortController().signal,()=>{},async()=>true);assert.equal(bad.outcome,'failed');assert.equal(bad.failureKind,'unknown');
 const quota=join(root,'quota.cjs');await writeFile(quota,"console.error('You have hit your usage limit 429');process.exit(1)");const limited=await executeAgentRounds({...template,args:[quota,'exec','{prompt}']},run,run.workspace,new AbortController().signal,()=>{},async()=>true);assert.equal(limited.failureKind,'quota');assert.equal(limited.rounds,1);
 const unpriced=await executeAgentRounds({...template,supervision:{...policy,billing:'priced'}},run,run.workspace,new AbortController().signal,()=>{},async()=>true);assert.equal(unpriced.outcome,'awaiting-cost');assert.equal(unpriced.rounds,1);
}));
