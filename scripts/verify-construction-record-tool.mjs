/** Produce a bounded, public test receipt for the construction ledger tool. */
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';

const run=spawnSync(process.execPath,['--test','--test-reporter=tap','scripts/test-construction-records.mjs'],{encoding:'utf8',windowsHide:true,timeout:30000});
assert.equal(run.status,0,'Construction record tests failed');
const count=key=>Number(run.stdout.match(new RegExp('^# '+key+' (\\d+)$','m'))?.[1]);
assert.equal(count('tests'),7);assert.equal(count('pass'),7);assert.equal(count('fail'),0);assert.equal(count('skipped'),0);assert.equal(count('cancelled'),0);
const files={};
for(const path of ['scripts/construction-records.mjs','scripts/test-construction-records.mjs','scripts/verify-construction-record-tool.mjs'])files[path]=createHash('sha256').update(await readFile(path)).digest('hex');
const result={at:new Date().toISOString(),exitCode:run.status,tests:7,passed:7,failed:0,skipped:0,cancelled:0,scopes:['dry-run and immutable retry','damaged/truncated history rejected','private values and evidence paths excluded','quoted JSON, quoted assignment, prefixed environment and password guards','free text cannot create executable Markdown links','concurrent writer lock','batch prevalidation and historical rendering'],files,passedAll:true};
await writeFile('artifacts/construction-history/record-tool-tests-r2.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result));
