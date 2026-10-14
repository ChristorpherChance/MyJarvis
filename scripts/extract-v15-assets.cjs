const {chromium}=require('C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('node:fs/promises');const path=require('node:path');
(async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 try{
  const page=await browser.newPage();await page.goto('file:///'+path.resolve('贾维斯V15.0 · 十套主题与全平台交互原型.html').replaceAll('\\','/')+'#theme=stark&view=overview');
  await page.waitForFunction(()=>typeof J5!=='undefined' && window.J7Visuals && Object.keys(window.J7Visuals).length===10);
  const snapshot=await page.evaluate(()=>({state:JSON.parse(JSON.stringify(S)),profiles:JSON.parse(JSON.stringify(profiles)),v5:JSON.parse(JSON.stringify(J5.state())),visuals:Object.keys(window.J7Visuals)}));
  await fs.mkdir('apps/web/src/demo',{recursive:true});await fs.writeFile('apps/web/src/demo/v15-seed.json',JSON.stringify(snapshot,null,2));
  const manifest=JSON.parse(await fs.readFile('prototype-v15/build-manifest.json','utf8'));
  const target='apps/web/public/themes';await fs.mkdir(target,{recursive:true});
  for(const name of ['stark','matrix','hero','jaeger','interstellar','mars','yijing','pantheon','shanshui','baijia','effects']){
    for(const ext of ['js','css']){
      const item=manifest.files.find(x=>x.path.endsWith('/'+name+'.'+ext));
      if(item)await fs.copyFile(item.path,path.join(target,name+'.'+ext));
    }
  }
  console.log(JSON.stringify({fields:Object.keys(snapshot.state),v5Fields:Object.keys(snapshot.v5),profiles:snapshot.profiles,visuals:snapshot.visuals},null,2));
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1});
