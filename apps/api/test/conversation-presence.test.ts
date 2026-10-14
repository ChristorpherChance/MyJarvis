import test from 'node:test';
import assert from 'node:assert/strict';
import {ConversationPresence,openingGreeting} from '../../web/src/features/family/conversation-presence.js';
test('greeting addresses the authenticated member without inventing a live status',()=>{assert.match(openingGreeting(' 小明 '),/^你好，小明。/);assert.match(openingGreeting(''),/朋友/);assert(openingGreeting('长'.repeat(100)).length<120);});
test('idle joke occurs once after an explicit start and not on a fresh page',()=>{const p=new ConversationPresence();assert.equal(p.take(true,1e12),null);p.begin(0);assert.equal(p.take(true,19999),null);assert.equal(p.take(false,30000),null);assert(p.take(true,30000));assert.equal(p.take(true,100000),null);});
test('reply time and subsequent silence are counted separately and stop prevents late jokes',()=>{const p=new ConversationPresence();p.begin(0);p.heard(12000);p.afterReply(80000);assert.equal(p.take(true,109999),null);assert(p.take(true,110000));p.heard(120000);p.stop();assert.equal(p.take(true,200000),null);});
