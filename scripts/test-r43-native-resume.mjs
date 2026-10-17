import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {cliSessionArguments,roundCliUsage} from '../apps/api/src/runtime/cli-supervision.ts';
test('native-format subprocess fixture uses exact resume and new directive on disk (adapter only)',()=>{
 const dir=mkdtempSync(join(tmpdir(),'r43-native-'));
 try{const fixture=join(dir,'fixture.mjs');writeFileSync(fixture,`import {writeFileSync} from 'node:fs';const a=process.argv.slice(2),at=a.indexOf('--resume'),prompt=a[a.indexOf('--print')+1];if(at>=0){if(a[at+1]!=='fixture-session')process.exit(41);writeFileSync('directive.txt',prompt);}console.log(JSON.stringify({type:'system',session_id:'fixture-session'}));console.log(JSON.stringify({type:'result',subtype:'success',session_id:'fixture-session',result:JSON.stringify({state:at<0?'needs_decision':'ready_for_review',summary:at<0?'choose strategy':'directive applied',options:at<0?['A','B']:[],evidence:[]}),usage:{input_tokens:10,output_tokens:2},total_cost_usd:at<0?0.1:0.15}));`);
 const template={engine:'claude'},first=spawnSync(process.execPath,[fixture,...cliSessionArguments(template,['--print','initial goal'])],{cwd:dir,encoding:'utf8'});assert.equal(first.status,0);const events=first.stdout.trim().split('\n').map(JSON.parse),native=events.at(-1);assert.equal(JSON.parse(native.result).state,'needs_decision');
 const second=spawnSync(process.execPath,[fixture,...cliSessionArguments(template,['--print','Choose B; write verified artifact'],native.session_id)],{cwd:dir,encoding:'utf8'});assert.equal(second.status,0);assert.equal(readFileSync(join(dir,'directive.txt'),'utf8'),'Choose B; write verified artifact');assert.equal(JSON.parse(JSON.parse(second.stdout.trim().split('\n').at(-1)).result).state,'ready_for_review');
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('Claude resumed cumulative cost delta and missing checkpoint remains unknown',()=>{const u={inputTokens:10,outputTokens:2,totalTokens:12,usageComplete:true};const p={billing:'record-only'};assert.equal(roundCliUsage('claude',u,'s',0.15,{engine:'claude',sessionId:'s',costUSD:0.1},p,'s').usage.costUSD,0.04999999999999999);assert.equal(roundCliUsage('claude',u,'s',0.15,undefined,p,'s').usage.costUSD,undefined);});
test('cross-session malformed resume rejected',()=>{assert.throws(()=>cliSessionArguments({engine:'claude'},['--print','x'],'../other'),/CLI_SESSION_ID_INVALID/);});
