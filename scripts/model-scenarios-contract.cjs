/** Narrow, repeatable model-scenario synchronization; unrelated schemas stay intact. */
const names=['chat','family-chat','voice-intent','companion','knowledge','memory','research','development','background','project-supervisor'];
function update(doc){
 const s=doc.components.schemas;
 s.PiScenario.properties.id.enum=[...names];
 for(const name of ['PiModelSettings','PiDefaultModelResult']){
  const scenarios=s[name].properties.routing.properties.scenarios;
  scenarios.minItems=names.length;scenarios.maxItems=names.length;
 }
 const routes=s.PiRoutes;const selection=Object.values(routes.properties)[0];
 routes.properties=Object.fromEntries(names.map(name=>[name,structuredClone(selection)]));
 s.PiConnectionCheckInput.properties.scenario.enum=[...names];
 return doc;
}
module.exports={names,update};
if(require.main===module){
 const fs=require('node:fs'),path=require('node:path');
 const file=path.resolve(__dirname,'../docs/openapi-v1-planned.json');
 fs.writeFileSync(file,JSON.stringify(update(JSON.parse(fs.readFileSync(file,'utf8'))),null,2)+'\n');
}
