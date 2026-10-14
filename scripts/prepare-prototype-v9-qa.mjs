import {readFile,writeFile} from 'node:fs/promises';
let nav=await readFile('scripts/qa-prototype-v8-navigation.cjs','utf8');
nav=nav.replaceAll('贾维斯V8.0 · 四套电影灵感与对话特效原型.html','贾维斯V9.0 · 六套主题与全平台交互原型.html').replaceAll('prototype-v8-navigation-qa','prototype-v9-navigation-qa').replaceAll("['stark','matrix','hero','jaeger']","['stark','matrix','hero','jaeger','interstellar','mars']");
await writeFile('scripts/qa-prototype-v9-navigation.cjs',nav);
let interactions=await readFile('scripts/qa-prototype-v9-interactions.cjs','utf8');
interactions=interactions.replace("check('英雄对比标题在暗底使用浅色',await p.locator('.j7-compare h1').evaluate(n=>getComputedStyle(n).color==='rgb(232, 242, 250)'))",`check('外观对比标题对比度清晰',await p.locator('.j7-compare h1').evaluate(n=>{const rgb=s=>(s.match(/[\\d.]+/g)||[]).slice(0,3).map(Number),l=s=>{const [r,g,b]=rgb(s).map(v=>{v/=255;return v<=.04045?v/12.92:Math.pow((v+.055)/1.055,2.4)});return .2126*r+.7152*g+.0722*b},a=l(getComputedStyle(n).color),b=l(getComputedStyle(n.closest('.j7-compare')).backgroundColor);return (Math.max(a,b)+.05)/(Math.min(a,b)+.05)>=4.5}))`);
await writeFile('scripts/qa-prototype-v9-interactions.cjs',interactions);
console.log('V9 navigation and contrast QA ready.');
