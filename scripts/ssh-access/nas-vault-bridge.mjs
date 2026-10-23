// Private pipe helper: only the parent process may consume stdout in memory.
import {DatabaseSync} from 'node:sqlite';
import {randomBytes,createHash} from 'node:crypto';
import {request} from 'node:https';
import {userInfo} from 'node:os';
if(userInfo().username!=='jarvis'||process.env.JARVIS_NAS_PRIVATE_PIPE!=='1'||process.stdout.isTTY)throw Error('PRIVATE_PIPE_REQUIRED');
const db=new DatabaseSync('/var/lib/jarvis/data/jarvis.db');
db.exec('PRAGMA busy_timeout=5000');
let token=randomBytes(32).toString('base64url');
const hash=createHash('sha256').update(token).digest('hex');
let result;
const api=(path,body)=>new Promise((resolve,reject)=>{
 const bytes=body===undefined?undefined:Buffer.from(JSON.stringify(body));
 const req=request(new URL(path,'https://cc-jarvis.ikvein.com'),{method:bytes?'POST':'GET',rejectUnauthorized:true,headers:{cookie:'jarvis_session='+token,accept:'application/json',...(bytes?{'content-type':'application/json','content-length':bytes.length}:{})}},res=>{
  let size=0;const parts=[];res.on('data',chunk=>{size+=chunk.length;if(size>1024*1024)res.destroy(Error('RESPONSE_TOO_LARGE'));else parts.push(chunk);});res.on('error',()=>reject(Error('HTTP_ERROR')));res.on('end',()=>{try{if(res.statusCode!==200)throw Error('HTTP_REJECTED');resolve(JSON.parse(Buffer.concat(parts).toString()));}catch{reject(Error('INVALID_RESPONSE'));}});
 });req.setTimeout(15000,()=>req.destroy());req.on('error',()=>reject(Error('HTTP_ERROR')));if(bytes)req.write(bytes);req.end();
});
try{
 db.prepare('INSERT INTO logins(tokenHash,expiresAt,createdAt) VALUES(?,?,?)').run(hash,Date.now()+120000,new Date().toISOString());
 const apps=await api('/api/runtime/applications?limit=100');
 const matches=apps.items.filter(app=>{try{const url=new URL(app.loginUrl);return app.name==='QTS 管理入口'&&url.protocol==='https:'&&url.hostname==='192.168.10.120'&&url.port==='5001';}catch{return false;}});
 if(matches.length!==1)throw Error('NAS_APPLICATION_NOT_UNIQUE');
 const credentials=await api('/api/runtime/applications/'+matches[0].id+'/credentials/reveal',{});
 if(!credentials.username||!credentials.password)throw Error('NAS_CREDENTIALS_MISSING');
 result={host:'192.168.10.120',port:22,username:credentials.username,password:credentials.password};
}finally{
 db.prepare('DELETE FROM logins WHERE tokenHash=?').run(hash);
 const remains=db.prepare('SELECT 1 FROM logins WHERE tokenHash=?').get(hash);
 db.close();token='';if(remains)throw Error('SESSION_CLEANUP_FAILED');
}
// Never run this helper directly in a terminal or include stdout in reports.
process.stdout.write(JSON.stringify(result));
