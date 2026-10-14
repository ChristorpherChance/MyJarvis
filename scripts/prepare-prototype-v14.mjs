import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
const root=process.cwd();
await mkdir(resolve(root,'prototype-v14'),{recursive:true});
let source=await readFile(resolve(root,'prototype-v13/cinematic.js'),'utf8');
source=source.replace("key='jarvis-v13-cinematic-preferences'","key='jarvis-v14-cinematic-preferences'")
 .replace("localStorage.getItem(key)||","localStorage.getItem(key)||localStorage.getItem('jarvis-v13-cinematic-preferences')||")
 .replace("sup.textContent='V13'","sup.textContent='V14'");
const descriptions={stark:'全息光核随声音响应，青金仪表呈现实时状态。',matrix:'代码晶体与数字雨，呈现聆听、理解和回应。',hero:'六英雄集结，英雄象征与能量随对话响应。',jaeger:'双动力核、神经协同与工业装甲组成机甲座舱。',interstellar:'引力光环、深空航迹与象牙白仪表，宁静而精密。',mars:'赤陶地貌与栖居网络，构成火星基地的日常。',yijing:'阴阳玉盘与八卦流转，青玉、朱砂映衬宣纸。',pantheon:'六神群像齐聚，雷霆、海潮与日冕响应对话。',shanshui:'云水、远山与水纹，让对话融入一卷山水。',baijia:'诗卷、古琴与六家竹简，营造月色书院。'};
source=source.replace(/\{id:'(\w+)'[^\n]*description:'[^']*'/g,(line,id)=>line.replace(/description:'[^']*'/,"description:'"+descriptions[id]+"'"));
const words=new Map([
 ['十种世界，同一个贾维斯。','主题外观'],['选择视觉语言，再进入完整的交互体验。','预览对话、总览和大屏，选择喜欢的主题。'],
 ['随机抽一套','随机主题'],['查看全部能力','全部功能'],['你需要的，都在这里。','全部功能'],
 ['20 个视图 · 7 类大屏 · 模拟数据共用 · 单文件离线体验','20 个页面 · 7 类大屏 · 离线模拟'],
 ['先完成或关闭当前事项，再比较外观。','请先关闭当前事项。'],['先完成或关闭当前事项，再查看能力目录。','请先关闭当前事项。']
]);
for(const [from,to] of words)source=source.replaceAll(from,to);
source=source.replace('<h2>全部功能</h2></div>'+"'+closeButton()+'"+'<\/header>', '</div>'+"'+closeButton()+'"+'<\/header>');
await writeFile(resolve(root,'prototype-v14/cinematic.js'),source,'utf8');
console.log('V14 theme coordinator prepared');
