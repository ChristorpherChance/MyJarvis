import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import vm from 'node:vm';

const root=process.cwd();
const files=['core','knowledge','voice-memory','research','operations'];
const basePath=resolve(root,'贾维斯 · 高保真交互原型.html');
let html=await readFile(basePath,'utf8');
const css=[],js=[],manifest=[];
for(const name of files){
  const cssText=await readFile(resolve(root,'prototype-v5',name+'.css'),'utf8');
  const jsText=await readFile(resolve(root,'prototype-v5',name+'.js'),'utf8');
  css.push(cssText);js.push(jsText);
  manifest.push({name,sha256:createHash('sha256').update(cssText+jsText).digest('hex')});
}
html=html.replace('<title>贾维斯 · 我的数字管家</title>','<title>贾维斯 V5 · 家庭与工作智能中枢</title>');
html=html.replace("const STORE='jarvis-interactive-prototype-v1';","const STORE='jarvis-v5-interactive-prototype-20261003';");
html=html.replace('</style>',css.join('\n')+'\n</style>');
const boot="J5.init(); S.settings.supervise=false; if(!admin()){U.route='chat';J5.state().terminal=true} if(location.hash==='#voice'){U.route='chat';J5.state().terminal=true} if(location.hash==='#control'&&admin()){U.route='overview';J5.state().terminal=false} if(location.hash==='#screen'){U.route='screen';J5.state().board=admin()?'all':'family'} render();";
html=html.replace(/if\(!admin\(\)\)U\.route='family';\s*render\(\);\s*<\/script>/,js.join('\n')+'\n'+boot+'\n</script>');
const script=html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
if(!script?.includes('const J5'))throw new Error('V5 integration marker missing');
new vm.Script(script,{filename:'jarvis-v5-inline.js'});
const output=resolve(root,'贾维斯V5.0 · 高保真交互原型.html');
await writeFile(output,html,'utf8');
await writeFile(resolve(root,'prototype-v5','build-manifest.json'),JSON.stringify({output,bytes:Buffer.byteLength(html),modules:manifest},null,2),'utf8');
console.log(JSON.stringify({output,bytes:Buffer.byteLength(html),modules:files.length,syntax:'valid'},null,2));
