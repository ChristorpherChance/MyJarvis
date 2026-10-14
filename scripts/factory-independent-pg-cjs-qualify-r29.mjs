/** Trusted UID1000 qualification. No connect/query; no production DB credentials. */
import assert from 'node:assert/strict';
import Module,{createRequire} from 'node:module';
import net from 'node:net';import tls from 'node:tls';
import {loadIndependentPG,verifyIndependentPGRuntime,validatePGObserverEnvironment} from './consumer.mjs';
const checks=[],at=new Date().toISOString();let lifecycle,networkCalls=0;
const oldConnect=net.Socket.prototype.connect,oldTLS=tls.connect;
net.Socket.prototype.connect=function(){networkCalls++;throw Error('QA_CJS_NETWORK_CALL_ATTEMPTED')};
tls.connect=function(){networkCalls++;throw Error('QA_CJS_NETWORK_CALL_ATTEMPTED')};
const originalResolve=Module._resolveFilename,originalLoad=Module._load;
const require=createRequire('/tools/qualify.mjs');
function record(id,fn){fn();checks.push({id,status:'pass'})}
function closed(id,fn,code){record(id,()=>assert.throws(fn,e=>e.code===code))}
try{
 record('nonroot',()=>assert.ok(process.getuid()===1000&&process.getgid()===1000));
 const outside=require('./outside.cjs');record('trusted-outside-preload',()=>assert.ok(outside.sentinel===1&&globalThis.__qaCJSOutsideLoads===1));
 lifecycle=await loadIndependentPG();record('actual-pg-loaded',()=>assert.ok(lifecycle.runtime.verified===true&&lifecycle.runtime.pgVersion==='8.23.0'&&lifecycle.runtime.manifestSHA256==='d916c96e199ab7230a6397cd1f4f6fdbceacf30588a16b6943dc8da2996b6eb1'));
 const parameters={host:'127.0.0.1',port:1,user:'qa-no-connect',database:'qa-no-connect',password:'qa-unused-fixture',connectionTimeoutMillis:100};
 const pool=new lifecycle.Pool(parameters),client=new lifecycle.Client(parameters);
 record('actual-pool-constructor',()=>assert.ok(pool instanceof lifecycle.Pool&&pool.totalCount===0));
 record('actual-client-constructor',()=>assert.ok(client instanceof lifecycle.Client&&typeof client.query==='function'&&typeof client.connect==='function'));
 record('builtin-resolution',()=>assert.equal(typeof require('node:fs').readFileSync,'function'));
 closed('native-client-rejected',()=>require('pg-native'),'QA_SQL_NATIVE_CLIENT_FORBIDDEN');
 closed('external-preloaded-fastpath-rejected',()=>require('./outside.cjs'),'QA_SQL_CLIENT_EXTERNAL_RESOLUTION');
 record('external-initializer-not-reexecuted',()=>assert.equal(globalThis.__qaCJSOutsideLoads,1));
 closed('unsafe-node-options-rejected',()=>validatePGObserverEnvironment({NODE_OPTIONS:'--require=foreign'}),'QA_SQL_CLIENT_ENVIRONMENT_INVALID');
 closed('unsafe-node-path-rejected',()=>validatePGObserverEnvironment({NODE_PATH:'/foreign'}),'QA_SQL_CLIENT_ENVIRONMENT_INVALID');
 closed('forced-native-rejected',()=>validatePGObserverEnvironment({PG_FORCE_NATIVE:'1'}),'QA_SQL_CLIENT_ENVIRONMENT_INVALID');
 lifecycle.assertCache();record('actual-cache-closure',()=>assert.equal(lifecycle.runtime.resolverClosureGuard,true));
 await pool.end();const final=await verifyIndependentPGRuntime();record('actual-post-load-full-tree',()=>assert.equal(final.treeSHA256,lifecycle.runtime.treeSHA256));
 record('no-network-method-called',()=>assert.equal(networkCalls,0));
 lifecycle.release();lifecycle=undefined;
 record('loader-hooks-restored',()=>assert.ok(Module._load===originalLoad&&Module._resolveFilename===originalResolve));
 console.log(JSON.stringify({schemaVersion:1,kind:'r29-independent-pg-cjs-qualification',at,status:'pass',checks,denominator:16,passed:checks.length,failed:0,pgVersion:'8.23.0',manifestSHA256:final.manifestSHA256,treeSHA256:final.treeSHA256,actualPGRequired:true,actualPoolConstructed:true,actualClientConstructed:true,networkCalls,databaseConnected:false,queriesIssued:0,productionDBAccessed:false,rootPackageJavaScriptExecuted:false,productAccepted:false,full74ObjectivesAccepted:false}));
}catch(e){console.log(JSON.stringify({schemaVersion:1,kind:'r29-independent-pg-cjs-qualification',at,status:'fail',checks,denominator:16,passed:checks.length,failed:1,errorCode:/^(?:QA_SQL|QA_CJS)_[A-Z0-9_]+$/.test(e.code??e.message)?e.code??e.message:'QA_CJS_ASSERTION_FAILED',networkCalls,databaseConnected:false,queriesIssued:0,productionDBAccessed:false,productAccepted:false}));process.exitCode=1;}
finally{try{lifecycle?.release()}finally{net.Socket.prototype.connect=oldConnect;tls.connect=oldTLS}}
