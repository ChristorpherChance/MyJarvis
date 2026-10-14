import test from 'node:test';
import assert from 'node:assert/strict';
import {canonicalLocalMachine,unifiedDevices} from '../src/runtime/managed-devices.ts';

test('current host aliases match only a unique real interface and keep local execution references',()=>{
 const machine={id:'primary-physical',kind:'machine',scope:'personal',address:'192.168.10.112',role:'平台主节点'};
 assert.equal(canonicalLocalMachine([machine],['127.0.0.1',machine.address]),machine);
 assert.equal(canonicalLocalMachine([{...machine,address:'127.0.0.1'}],['127.0.0.1']),undefined);
 assert.equal(canonicalLocalMachine([machine,{...machine,id:'duplicate'}],[machine.address]),undefined);
 assert.equal(canonicalLocalMachine([{...machine,scope:'company'}],[machine.address]),undefined);
 assert.equal(canonicalLocalMachine([machine],['192.168.10.101']),undefined);
 const legacy=[{id:'local',canonicalMachineId:machine.id,status:'online'}];
 const at=Date.now(),paired={...machine,agentStatus:'connected',lastSeen:new Date(at).toISOString()};
 const unified=unifiedDevices(legacy,[paired],at);assert.equal(unified.length,1);assert.equal(unified[0].id,machine.id);assert.equal(unified[0].status,'online');
 assert.equal(legacy[0].id,'local');assert.equal(unifiedDevices(legacy,[])[0].id,'local');
 assert.equal(unifiedDevices(legacy,[paired],at+60001)[0].status,'unknown');
 assert.equal(unifiedDevices(legacy,[paired],at-30000)[0].status,'unknown');
});
