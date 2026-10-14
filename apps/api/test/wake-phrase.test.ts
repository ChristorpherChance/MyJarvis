import {test} from 'node:test';
import assert from 'node:assert/strict';
import {matchWakePhrase} from '../../web/src/features/family/wake-phrase.js';
test('English wake phrase accepts recognition casing without sending the wake-only phrase as a request',()=>{
 assert.deepEqual(matchWakePhrase('HELLO JARVIS','hello jarvis'),{detected:true,remaining:''});
 assert.deepEqual(matchWakePhrase('Hello, Jarvis. 请检查书房服务器。','hello jarvis'),{detected:true,remaining:'请检查书房服务器。'});
 assert.deepEqual(matchWakePhrase('hello  jarvis，请讲个故事','hello jarvis'),{detected:true,remaining:'请讲个故事'});
});
test('wake matching keeps member phrases literal and rejects partial English words',()=>{
 assert.deepEqual(matchWakePhrase('shellojarvisian','hello jarvis'),{detected:false,remaining:'shellojarvisian'});
 assert.equal(matchWakePhrase('hello jarvisian','hello jarvis').detected,false);
 assert.deepEqual(matchWakePhrase('小贾，请讲个故事','小贾'),{detected:true,remaining:'请讲个故事'});
 assert.equal(matchWakePhrase('Jxxxx, 帮帮我','J.*').detected,false);
});
