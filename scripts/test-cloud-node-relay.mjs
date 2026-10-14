import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign,createHash} from 'node:crypto';
import {canonical,validateEnvelope} from './cloud-node-relay.mjs';

test('cloud relay validates signed source, fixed binding, fresh readings and whitelisted headers',()=>{
 const keys=generateKeyPairSync('ed25519'),peer={agentId:'a8b19d38-8e47-4faa-9c9b-44bdc21325b8',machineId:'gz',publicKey:keys.publicKey.export({format:'pem',type:'spki'}).toString()},timestamp=new Date().toISOString(),body={metrics:{cpuPercent:0,memoryUsedGB:1.25},serviceProcesses:[],leases:[]};
 const item={version:1,agentId:peer.agentId,machineId:'gz',method:'POST',path:'/api/v1/agents/'+peer.agentId+'/heartbeat',body,headers:{'x-jarvis-timestamp':timestamp,'x-jarvis-nonce':'a'.repeat(32),'x-jarvis-signature':''}};
 const text=['POST',item.path,timestamp,item.headers['x-jarvis-nonce'],createHash('sha256').update(canonical(body)).digest('hex')].join('\n');item.headers['x-jarvis-signature']=sign(null,Buffer.from(text),keys.privateKey).toString('base64url');
 assert.equal(validateEnvelope(peer,item),item);
 assert.throws(()=>validateEnvelope(peer,{...item,path:'/api/auth/login'}),/BINDING/);
 assert.throws(()=>validateEnvelope({...peer,machineId:'jp'},item),/BINDING/);
 assert.throws(()=>validateEnvelope(peer,{...item,body:{...body,metrics:{cpuPercent:100}}}),/SIGNATURE/);
 assert.throws(()=>validateEnvelope(peer,item,Date.now()+30000),/FRESHNESS/);
 assert.throws(()=>validateEnvelope(peer,{...item,headers:{...item.headers,authorization:'secret'}}),/HEADERS/);
 assert.throws(()=>validateEnvelope({...peer,publicKey:generateKeyPairSync('ed25519').publicKey.export({format:'pem',type:'spki'}).toString()},item),/SIGNATURE/);
});
