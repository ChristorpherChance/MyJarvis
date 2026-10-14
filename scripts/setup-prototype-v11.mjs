import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const root=process.cwd(),r=p=>resolve(root,p);
await mkdir(r('prototype-v11/assets'),{recursive:true});
await mkdir(r('artifacts/prototype-v11-qa/previews'),{recursive:true});
await copyFile('C:/Users/Admin/.codex/generated_images/01a0fc97-db8c-7810-b947-ccb5aeab5159/exec-ed85fa5c-b53e-42f8-b321-c48d1a92cdc0.png',r('prototype-v11/assets/pantheon-assembly.png'));
for(const n of ['cinematic.js','layout.css','theme-polish.css'])await copyFile(r('prototype-v10/'+n),r('prototype-v11/'+n));
let js=await readFile(r('prototype-v11/cinematic.js'),'utf8');
const old=js.split('\n').find(x=>x.includes("{id:'pantheon'"));
if(!old)throw new Error('Missing pantheon metadata');
js=js.replace(old,`  {id:'pantheon',name:'众神议事厅',short:'西方众神',en:'PANTHEON / ASSEMBLY',number:'08',tone:'dark',accent:'#d8b97a',secondary:'#8ed5d5',surface:'#101a1e',text:'#f0e7d2',subtitle:'六神群像 · 雷霆与海潮 · 石雕与古金',description:'六位神祇的雕塑与象征齐聚议事厅，雷电、海潮与日冕随对话变化；深青石材与古金纹饰连接家庭陪伴和全域管理。'},
  {id:'shanshui',name:'一川烟雨',short:'山水墨画',en:'INK / LANDSCAPE',number:'09',tone:'light',accent:'#364e55',secondary:'#a5473a',surface:'#f4f2eb',text:'#283333',subtitle:'水墨长卷 · 云水远山 · 留白与朱砂',description:'在一卷可呼吸的山水中说话，晨岚、月色与听雨各有意境；墨色浓淡、云雾与水纹陪伴日常，清晰留白安放每项事务。'},
  {id:'baijia',name:'百家争鸣',short:'诸子百家',en:'SCHOOLS / DIALOGUE',number:'10',tone:'dark',accent:'#f0c881',secondary:'#9fbca4',surface:'#182521',text:'#f1e7d2',subtitle:'青铜文枢 · 六家竹简 · 书院灯火',description:'儒、道、墨、法、兵、名六家书卷围绕青铜文枢展开，以竹简、古印和温暖灯火呈现知识、对话与思考。'}
`);
js=js.replaceAll('jarvis-v10-cinematic-preferences','jarvis-v11-cinematic-preferences').replace("localStorage.getItem(key)||","localStorage.getItem(key)||localStorage.getItem('jarvis-v10-cinematic-preferences')||");
js=js.replaceAll('八套','十套').replaceAll('八种世界','十种世界').replace("sup.textContent='V10'","sup.textContent='V11'");
js=js.replace("d.id==='pantheon'?'#b6aed0':","d.id==='pantheon'?'#b5c0c0':d.id==='shanshui'?'#66716f':d.id==='baijia'?'#b6c3b6':");
js=js.replace("if(e.altKey&&/^[1-9]$/.test(e.key)&&Number(e.key)>0&&Number(e.key)<=designs.length){e.preventDefault();apply(designs[Number(e.key)-1].id)}","if(e.altKey&&/^[0-9]$/.test(e.key)){const index=e.key==='0'?9:Number(e.key)-1;if(index>=0&&index<designs.length){e.preventDefault();apply(designs[index].id)}}");
await writeFile(r('prototype-v11/cinematic.js'),js);
let css=await readFile(r('prototype-v11/layout.css'),'utf8');
css=css.replaceAll('Eight','Ten').replace(/\beight\b/g,'ten').replaceAll('repeat(4,minmax(0,1fr))','repeat(5,minmax(0,1fr))');
css+=`\n/* New light landscapes keep readable gallery accents on either surface. */
html[data-j7-theme][data-j7-tone="dark"] .j7-design-card[style*="#364e55"]{--design-accent:#a9c8ca!important}
@media(min-width:761px) and (max-width:1500px){html[data-j7-theme] .j7-film-switch button{font-size:10px;padding:7px 7px;gap:4px}}
@media(max-width:760px){html[data-j7-theme] .j7-film-switch{grid-template-columns:repeat(5,minmax(0,1fr))}html[data-j7-theme] .j7-film-switch button{font-size:9px;padding:5px 2px;gap:2px}}
@media(min-width:1280px){html[data-j7-theme] .j7-card-copy{padding:14px}html[data-j7-theme] .j7-card-copy h2{font-size:20px}}
`;
await writeFile(r('prototype-v11/layout.css'),css);
let build=await readFile(r('scripts/build-prototype-v10.mjs'),'utf8');
build=build.replaceAll('prototype-v10/','prototype-v11/').replaceAll('prototype-v10','prototype-v11').replaceAll('贾维斯V10.0 · 八套主题与全平台交互原型.html','贾维斯V11.0 · 十套主题与全平台交互原型.html').replaceAll('贾维斯 V10 · 八套主题与全平台交互原型','贾维斯 V11 · 十套主题与全平台交互原型').replaceAll('贾维斯 V10','贾维斯 V11').replaceAll('Jarvis-V10-','Jarvis-V11-').replaceAll('jarvis-v10-inline','jarvis-v11-inline');
build=build.replace("'yijing','pantheon'];","'yijing','pantheon','shanshui','baijia'];");
build=build.replace("['yijing','pantheon'].includes(n)?'prototype-v11/':","['pantheon','shanshui','baijia'].includes(n)?'prototype-v11/':n==='yijing'?'prototype-v10/':");
build=build.replace("html=html.replace('</script>',","const art='data:image/png;base64,'+(await readFile(resolve(root,'prototype-v11/assets/pantheon-assembly.png'))).toString('base64');\nhtml=html.replace('</script>',");
build=build.replace('"\\nwindow.J7Visuals=window.J7Visuals||{};\\n"+', '"\\nwindow.J11PantheonArt="+JSON.stringify(art)+";\\nwindow.J7Visuals=window.J7Visuals||{};\\n"+');
build=build.replace("const manifest={output,", "const manifest={output,artAsset:'prototype-v11/assets/pantheon-assembly.png',");
await writeFile(r('scripts/build-prototype-v11.mjs'),build);
for(const n of ['stark','matrix','hero','jaeger','interstellar','mars','yijing'])for(const v of ['chat','overview','screen'])await copyFile(r('artifacts/prototype-v10-qa/previews/'+n+'-'+v+'.jpg'),r('artifacts/prototype-v11-qa/previews/'+n+'-'+v+'.jpg'));
for(const n of ['qa-prototype','audit-prototype','capture-prototype']){}
for(const [input,output] of [
 ['scripts/qa-prototype-v10.cjs','scripts/qa-prototype-v11.cjs'],
 ['scripts/audit-prototype-v10-visuals.cjs','scripts/audit-prototype-v11-visuals.cjs'],
 ['scripts/capture-prototype-v10-previews.cjs','scripts/capture-prototype-v11-previews.cjs'],
 ['scripts/capture-prototype-v10-effects.cjs','scripts/capture-prototype-v11-effects.cjs'],
 ['scripts/capture-prototype-v10-gallery.cjs','scripts/capture-prototype-v11-gallery.cjs']
]){let s=await readFile(r(input),'utf8');s=s.replaceAll('prototype-v10','prototype-v11').replaceAll('贾维斯V10.0 · 八套主题与全平台交互原型.html','贾维斯V11.0 · 十套主题与全平台交互原型.html');await writeFile(r(output),s)}
let guide=await readFile(r('贾维斯V10.0 · 八套主题与全平台体验说明.md'),'utf8');guide=guide.replaceAll('V10','V11').replaceAll('八套','十套').replaceAll('八种','十种').replaceAll('顶部八个','顶部十个').replace('键盘 `Alt + 1` 至 `Alt + 8` 可快捷切换。','键盘 `Alt + 1` 至 `Alt + 9` 可快捷切换前九套，`Alt + 0` 切换诸子百家。').replace('| 西方众神 · 万神穹庭 | 月光水晶、悬浮神殿、星座与徽记 | 午夜靛紫、月光白、淡金 |','| 西方众神 · 众神议事厅 | 六位众神石雕、神祇切换、雷霆与海潮 | 深青黑石材、古金、海玻璃色 |\n| 山水墨画 · 一川烟雨 | 水墨长卷、层叠远山、云水与孤舟 | 宣纸灰白、墨灰蓝、石青与朱砂 |\n| 诸子百家 · 百家争鸣 | 青铜文枢、竹简与六家古印 | 深翡翠、青铜金、书院灯火 |');guide+='\n## 主题中的独立互动\n\n西方众神可选择不同神祇；山水墨画可切换晨岚、月色和听雨；诸子百家可切换六家视角。这些选择改变画面与对话特效，业务请求、权限和私人记忆保持原有规则。\n\n西方众神原创群像由内置 imagegen 生成并内嵌至单 HTML，素材与完整提示词存于 `prototype-v11/assets/`。\n';await writeFile(r('贾维斯V11.0 · 十套主题与全平台体验说明.md'),guide);
console.log('V11 integration, image asset, 21 prior previews and QA helpers prepared.');
