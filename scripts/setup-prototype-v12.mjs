import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
const root=process.cwd();
await mkdir(resolve(root,'prototype-v12'),{recursive:true});
for(const name of ['cinematic.js','layout.css','theme-polish.css']) {
  const text=await readFile(resolve(root,'prototype-v11',name),'utf8');
  await writeFile(resolve(root,'prototype-v12',name),text,'utf8');
}
let js=await readFile(resolve(root,'prototype-v12/cinematic.js'),'utf8');
js=js.replace("{id:'hero',name:'赤金装甲舱',short:'漫威',en:'MARK / ARMOR',number:'03',tone:'light',accent:'#c52c37',secondary:'#efbc5b',surface:'#fff8e7',text:'#272724',subtitle:'钢铁侠头盔 · 红金装甲 · 漫画分镜',description:'红金头盔与发光双眼构成你的联络核心，炭黑、暖白和金属分镜连接日常陪伴与全域指挥。'}", "{id:'hero',name:'复仇者联盟',short:'复仇者联盟',en:'AVENGERS / ASSEMBLE',number:'03',tone:'dark',accent:'#efc779',secondary:'#8bc9e8',surface:'#121923',text:'#edf1f4',subtitle:'六英雄集结 · 金属联络 · 协同守望',description:'钢铁侠、美队、索尔、浩克、黑寡妇与鹰眼共同集结；英雄象征与能量随对话响应，红蓝银光连接家人与每一项工作。'}");
js=js.replace("{id:'baijia',name:'百家争鸣',short:'诸子百家',en:'SCHOOLS / DIALOGUE',number:'10',tone:'dark',accent:'#f0c881',secondary:'#9fbca4',surface:'#182521',text:'#f1e7d2',subtitle:'青铜文枢 · 六家竹简 · 书院灯火',description:'儒、道、墨、法、兵、名六家书卷围绕青铜文枢展开，以竹简、古印和温暖灯火呈现知识、对话与思考。'}", "{id:'baijia',name:'百家书院',short:'诸子百家',en:'SCHOOLS / POETRY',number:'10',tone:'light',accent:'#476858',secondary:'#a74332',surface:'#f3ecdf',text:'#2f3830',subtitle:'诗卷琴月 · 六家竹简 · 宣纸与古金',description:'在月色与书院灯火中对话，儒道墨法兵名六家各有题句；诗卷、古琴、花枝与竹简为知识和思考添一份古韵。'}");
js=js.replace("key='jarvis-v11-cinematic-preferences'","key='jarvis-v12-cinematic-preferences'").replace("localStorage.getItem(key)||localStorage.getItem('jarvis-v10", "localStorage.getItem(key)||localStorage.getItem('jarvis-v11-cinematic-preferences')||localStorage.getItem('jarvis-v10");
js=js.replace("d.id==='baijia'?'#b6c3b6':", "d.id==='baijia'?'#687263':d.id==='hero'?'#acb9c5':");
await writeFile(resolve(root,'prototype-v12/cinematic.js'),js,'utf8');
let build=await readFile(resolve(root,'scripts/build-prototype-v11.mjs'),'utf8');
build=build.replace("['pantheon','shanshui','baijia'].includes(n)?'prototype-v11/'", "['hero','baijia'].includes(n)?'prototype-v12/':['pantheon','shanshui'].includes(n)?'prototype-v11/'");
build=build.replaceAll('prototype-v11/layout.css','prototype-v12/layout.css').replaceAll('prototype-v11/theme-polish.css','prototype-v12/theme-polish.css').replaceAll('prototype-v11/cinematic.js','prototype-v12/cinematic.js');
build=build.replace("'prototype-v12/theme-polish.css'];", "'prototype-v12/theme-polish.css','prototype-v12/immersive.css'];");
build=build.replace("'prototype-v7/navigation.js'];", "'prototype-v7/navigation.js','prototype-v12/immersive.js'];");
build=build.replace("catch{}}}", "catch{try{previews[name][view]='data:image/jpeg;base64,'+(await readFile(resolve(root,'artifacts/prototype-v11-qa/previews/'+name+'-'+view+'.jpg'))).toString('base64')}catch{}}}}");
build=build.replace('artifacts/prototype-v11-qa/previews/', 'artifacts/prototype-v12-qa/previews/');
build=build.replaceAll('V11','V12').replaceAll('v11-inline','v12-inline').replace("mkdir(resolve(root,'prototype-v11')", "mkdir(resolve(root,'prototype-v12')").replace('prototype-v11/build-manifest.json','prototype-v12/build-manifest.json');
build=build.replace("html=html.replace('</script>',", "let avengers='';try{avengers='data:image/webp;base64,'+(await readFile(resolve(root,'prototype-v12/assets/avengers-assembly.webp'))).toString('base64')}catch{try{avengers='data:image/png;base64,'+(await readFile(resolve(root,'prototype-v12/assets/avengers-assembly.png'))).toString('base64')}catch{}}\nhtml=html.replace('</script>',\"\\nwindow.J12AvengersArt=\"+JSON.stringify(avengers)+\";\"+");
await writeFile(resolve(root,'scripts/build-prototype-v12.mjs'),build,'utf8');
console.log('V12 shared sources and builder prepared; owned theme files preserved.');
