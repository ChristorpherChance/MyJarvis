/** Apply the owner's requested family output policies through versioned platform commands. */
import {randomUUID} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {withPlatform} from './managed-server-client.mjs';

const expectedBuild='20261010-auto-language-r17';
const targets=[
 {profileId:'me',name:'我',role:'owner',replyLanguage:'en'},
 {name:'老婆',role:'adult',replyLanguage:'en'},
 {name:'大儿子',role:'child',replyLanguage:'en'},
 {name:'小儿子',role:'child',replyLanguage:'en'},
 {name:'爸爸',role:'elder',replyLanguage:'zh'},
 {name:'妈妈',role:'elder',replyLanguage:'zh'},
];
if(!process.argv.includes('--execute')){
 console.log(JSON.stringify({prepared:true,expectedBuild,targets,credentialsConfigured:false}));
}else{
 await mkdir('artifacts/auto-language-r17',{recursive:true});
 const checkpoint=changes=>writeFile('artifacts/auto-language-r17/family-reply-policies.json',JSON.stringify({at:new Date().toISOString(),build:expectedBuild,changes,credentialsConfigured:false},null,2));
 const changes=await withPlatform(async({api,records})=>{
  const health=await api('/api/health');if(health.build!==expectedBuild)throw Error('EXPECTED_BUILD_NOT_ONLINE');
  const bootstrap=await api('/api/bootstrap'),personas=await records('personas');
  const members=[...(bootstrap.members??[]).map(member=>({...member,profileId:member.id==='owner'?'me':member.id})),
   ...personas.filter(record=>record.kind==='profile'&&record.status==='registered')];
  const run=async(command,payload,expectedVersion)=>(await api('/api/v1/personas/commands/'+command,{commandId:randomUUID(),scope:'private',expectedVersion,payload})).data;
  const output=[];
  for(const target of targets){
   const matches=target.profileId?members.filter(member=>member.profileId===target.profileId):members.filter(member=>member.name===target.name);
   if(matches.length>1)throw Error('AMBIGUOUS_FAMILY_NAME');
   let member=matches[0],created=false;
   if(!member){member=await run('register',{name:target.name,role:target.role},0);members.push(member);created=true;}
   const profileId=member.profileId??member.id,old=personas.find(record=>record.kind==='persona'&&record.profileId===profileId);
   if(old?.replyLanguage===target.replyLanguage){output.push({profileId,name:target.name,created,changed:false,replyLanguage:old.replyLanguage,revision:old.revision});await checkpoint(output);continue;}
   let updated=await run('reply-language',{profileId,replyLanguage:target.replyLanguage},old?.revision??0);
   if(created)updated=await run('wake-word',{profileId,wakeWord:'hello jarvis'},updated.revision);
   output.push({profileId,name:target.name,created,changed:true,previousReplyLanguage:old?.replyLanguage??'auto',previousRevision:old?.revision??0,replyLanguage:updated.replyLanguage,revision:updated.revision,...(created?{wakeWord:updated.wakeWord}:{})});
   await checkpoint(output);
  }
  return output;
 });
 await checkpoint(changes);
 console.log(JSON.stringify({configured:changes.length,changes,credentialsConfigured:false}));
}
