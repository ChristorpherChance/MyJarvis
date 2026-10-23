/** Narrow schema updater only for the two persona save quiet-hours fields. */
module.exports=function updatePersonaQuietHoursContract(doc){
 const save=doc.components.schemas.PersonasSavePayload;
 if(!save?.properties?.start||!save?.properties?.end)throw new Error('PersonasSavePayload start/end schema missing');
 const timeOrEmpty={anyOf:[{type:'string',pattern:'^([01][0-9]|2[0-3]):[0-5][0-9]$'},{type:'string',const:''}]};
 save.properties.start=structuredClone(timeOrEmpty);save.properties.end=structuredClone(timeOrEmpty);
 const pair=[{if:{properties:{start:{const:''}},required:['start']},then:{properties:{end:{const:''}}}},{if:{properties:{end:{const:''}},required:['end']},then:{properties:{start:{const:''}}}}];
 const normalize=rules=>(rules??[]).filter(rule=>!rule?.['x-persona-time-pair']);
 save.allOf=[...normalize(save.allOf),...pair.map(rule=>({...rule,'x-persona-time-pair':true}))];
 return doc;
};
