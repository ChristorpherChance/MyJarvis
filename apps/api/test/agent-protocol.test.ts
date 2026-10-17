import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { StringDecoder } from 'node:string_decoder';
import { AgentProtocolConsumer } from '../src/runtime/agent-protocol.ts';

test('real child emits more than 4MiB of valid native events then a short final event',async()=>{
 const p=new AgentProtocolConsumer('fixed'),decoder=new StringDecoder('utf8');let pending='',diagnosticBytes=0,legacyRetainedBytes=0,legacyPrefix='';
 const script=`const n=330;for(let i=0;i<n;i++)process.stdout.write(JSON.stringify({type:'execution.progress',sequence:i,payload:'x'.repeat(16000)})+'\\n');process.stdout.write(JSON.stringify({type:'execution.result',summary:'done',usage:{inputTokens:7,outputTokens:3}})+'\\n');`;
 const child=spawn(process.execPath,['-e',script],{stdio:['ignore','pipe','pipe']});let oldWindow='';
 let stderr='';child.stdout.on('data',chunk=>{diagnosticBytes+=chunk.length;pending+=decoder.write(chunk);let i;while((i=pending.indexOf('\n'))>=0){const line=pending.slice(0,i).replace(/\r$/,'');p.consume(line);if(legacyRetainedBytes<4*1024*1024){const retained=line.slice(0,16000);const remaining=4*1024*1024-legacyRetainedBytes;legacyPrefix+=retained.slice(0,remaining);legacyRetainedBytes+=Buffer.byteLength(retained.slice(0,remaining));}oldWindow=(oldWindow+'\n'+line).slice(-4*1024*1024);pending=pending.slice(i+1);}});child.stderr.on('data',chunk=>stderr+=chunk.toString());
 const code=await new Promise<number>((resolve,reject)=>{child.once('error',reject);child.once('close',c=>resolve(c??-1))});pending+=decoder.end();if(pending)p.consume(pending.replace(/\r$/,''));
 assert.equal(code,0,stderr);assert.ok(diagnosticBytes>4*1024*1024);assert.equal(legacyPrefix.includes('execution.result'),false,'legacy 4MiB stdout prefix must miss final event');assert.equal(oldWindow.includes('execution.result'),true,'the native final event exists after the legacy prefix');const result=p.finish();assert.equal(result.error,undefined);assert.equal(result.lines.length,1);assert.deepEqual(JSON.parse(result.lines[0]!),{type:'execution.result',summary:'done',usage:{inputTokens:7,outputTokens:3}});
});

test('final event permits stable-key reserialization but rejects conflicting finals and absence',()=>{
 const first=new AgentProtocolConsumer('fixed');first.consume('{"type":"execution.result","summary":"ok","usage":{"inputTokens":1,"outputTokens":2}}');first.consume('{"usage":{"outputTokens":2,"inputTokens":1},"summary":"ok","type":"execution.result"}');assert.equal(first.finish().error,undefined);
 const conflict=new AgentProtocolConsumer('fixed');conflict.consume('{"type":"execution.result","summary":"one"}');conflict.consume('{"type":"execution.result","summary":"two"}');assert.equal(conflict.finish().error,'AGENT_PROTOCOL_FINAL_CONFLICT');
 assert.equal(new AgentProtocolConsumer('fixed').finish().error,'AGENT_PROTOCOL_FINAL_MISSING');
});

test('protocol line cap, UTF-8 split reconstruction and supervisor-specific strict schema',()=>{
 const tooLong=new AgentProtocolConsumer('fixed');tooLong.consume(' '.repeat(4*1024*1024+1));assert.equal(tooLong.finish().error,'AGENT_PROTOCOL_LINE_TOO_LONG');
 const supervisor=new AgentProtocolConsumer('fixed','project-supervisor');
 const valid={state:'progress',summary:'正在推进',question:'',options:[],recommendedOption:null,evidence:[],nextSuggestion:'继续核对'};
 supervisor.consume(JSON.stringify({type:'execution.result',summary:JSON.stringify(valid)}));assert.equal(supervisor.finish().error,undefined);
 const invalid=new AgentProtocolConsumer('fixed','project-supervisor');invalid.consume(JSON.stringify({type:'execution.result',summary:JSON.stringify({...valid,action:'continue'})}));assert.equal(invalid.finish().error,'AGENT_SUPERVISOR_PROTOCOL_INVALID');
});
