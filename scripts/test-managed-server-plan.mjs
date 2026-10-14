import test from 'node:test';
import assert from 'node:assert/strict';
import {loadPlan,validatePlan,verifyInspection} from './managed-server-plan.mjs';

test('fixed five-server plan refuses unsafe commands, duplicates, traversal and unexpected identities',async()=>{
 const plan=await loadPlan();assert.equal(plan.servers.length,5);assert.equal(plan.servers.flatMap(s=>s.services).length,28);
 const change=fn=>{const p=structuredClone(plan);fn(p);return p;};
 assert.throws(()=>validatePlan(change(p=>p.servers[0].services[0].unit='ssh.service;reboot')),/fixed systemd/);
 assert.throws(()=>validatePlan(change(p=>p.servers.push(p.servers[0]))),/duplicate server/);
 assert.throws(()=>validatePlan(change(p=>p.servers[0].profile='C:/outside/config')),/pinned profile/);
 assert.throws(()=>validatePlan(change(p=>p.servers[0].services.push(p.servers[0].services[0]))),/duplicate unit/);
 assert.throws(()=>validatePlan(change(p=>p.servers[0].id='../../etc')),/id/);
 const s=plan.servers[0],hardware={hostname:s.hostname,hostKey:'256 '+s.fingerprint+' host (ED25519)',python:'3.14',openssl:'OpenSSL 3.5',ramGB:30,diskGB:232,services:s.services.map(v=>({Id:v.unit}))};
 assert.equal(verifyInspection(s,hardware),hardware);
 assert.throws(()=>verifyInspection(s,{...hardware,hostname:'other-host'}),/IDENTITY/);
 assert.throws(()=>verifyInspection(s,{...hardware,hostKey:'different-key'}),/IDENTITY/);
 assert.throws(()=>verifyInspection(s,{...hardware,services:[]}),/NOT_LOADED/);
 assert.equal(s.services.find(v=>v.unit==='jarvis-platform.service').expected,'stopped');
});
