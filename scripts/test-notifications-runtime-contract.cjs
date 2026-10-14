const assert=require('node:assert/strict');
const extend=require('./notifications-runtime-contract.cjs');
const d={paths:{},components:{schemas:{},securitySchemes:{SessionCookie:{type:'apiKey',in:'cookie',name:'jarvis_session'}}}};
extend(d);
const ids=new Set();let count=0;
function visit(value){if(!value||typeof value!=='object')return;if(value.$ref){assert.ok(value.$ref.startsWith('#/'));let current=d;for(const key of value.$ref.slice(2).split('/'))current=current?.[key];assert.ok(current,'unresolved '+value.$ref);}for(const nested of Object.values(value))visit(nested);}
visit(d);
for(const [path,item]of Object.entries(d.paths))for(const [method,op]of Object.entries(item)){assert.ok(op.operationId,path);assert.ok(!ids.has(op.operationId),'duplicate '+op.operationId);ids.add(op.operationId);count++;for(const option of op.security)for(const scheme of Object.keys(option))assert.ok(d.components.securitySchemes[scheme],scheme);if(path.includes('/room/')||path.includes('/deliveries/'))assert.deepEqual(op.security,[{MemberCookie:[],TerminalToken:[]}]);assert.equal(op['x-implementation-status'],'implemented');}
assert.equal(count,12);
extend(d);assert.equal(Object.values(d.paths).reduce((n,item)=>n+Object.keys(item).length,0),12);
console.log('12 notification operations: unique IDs, resolved references, real member/terminal security and idempotent merge verified');
