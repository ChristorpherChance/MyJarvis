/** Read only the registered family roster and reply preference; never log credentials or chats. */
import {withPlatform} from './managed-server-client.mjs';
const roster=await withPlatform(async({api,records})=>{
 const [bootstrap,personas]=await Promise.all([api('/api/bootstrap'),records('personas')]);
 const members=[{id:'me',name:bootstrap.members?.find(member=>member.id==='owner')?.name??'我',role:'owner'},
  ...(bootstrap.members??[]).filter(member=>member.id!=='owner').map(member=>({id:member.id,name:member.name,role:member.role})),
  ...personas.filter(persona=>persona.kind==='profile').map(persona=>({id:persona.profileId,name:persona.name,role:persona.role}))];
 return [...new Map(members.map(member=>[member.id,member])).values()].map(member=>{
  const persona=personas.find(record=>record.kind==='persona'&&record.profileId===member.id);
  return {...member,replyLanguage:persona?.replyLanguage??'auto',revision:persona?.revision??0};
 });
});
console.log(JSON.stringify({members:roster},null,2));
