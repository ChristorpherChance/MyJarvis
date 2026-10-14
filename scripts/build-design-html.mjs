import { readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

// Usage: node scripts/build-design-html.mjs [markdown-file]
// Install marked locally, or set JARVIS_NODE_MODULES to a directory containing it.
const require = createRequire(import.meta.url);
const searchPaths = [process.cwd(), ...(process.env.JARVIS_NODE_MODULES ? [process.env.JARVIS_NODE_MODULES] : [])];
const { marked } = await import(pathToFileURL(require.resolve('marked', { paths: searchPaths })).href);
const input = resolve(process.argv[2] ?? '贾维斯V4.0 · 总体设计与设备规划.md');
const output = resolve(dirname(input), `${basename(input, extname(input))}.html`);
const source = await readFile(input, 'utf8');
const sourceHash = createHash('sha256').update(source, 'utf8').digest('hex');
const escape = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
const plain = value => value.replace(/<[^>]*>/g, '').replaceAll('&amp;', '&').replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&quot;', '"').replaceAll('&#39;', "'");
const title = source.match(/^#\s+(.+)$/m)?.[1] ?? basename(input, extname(input));
const metadataMatch = source.match(/<!--\s*jarvis-doc-meta\s+([\s\S]*?)\s*-->/);
const metadata = metadataMatch ? JSON.parse(metadataMatch[1]) : {};
const version = metadata.version ?? 'V4.0';
const date = metadata.date ?? '2026-10-02';
const eyebrow = metadata.eyebrow ?? '总体设计 / 设备规划 / V4.0';
const subtitle = metadata.subtitle ?? '面向全家的日常服务，连接机器、项目、经验与技能，持续跟踪开发工作的进展。';
const stats = metadata.stats ?? [
  { value: '18 台', label: '电脑 · 另有 NAS 与两台云服务器' },
  { value: '10 台', label: 'i3 小机 · 每台 16G / 256G' },
  { value: '5 项', label: '核心职责 · 家庭与开发服务' },
];
const statsHtml = stats.map(stat => `<div class="stat"><strong>${escape(stat.value)}</strong><span>${escape(stat.label)}</span></div>`).join('');
const headings = [];
let major = 0;
let minor = 0;
let body = marked.parse(metadataMatch ? source.replace(metadataMatch[0], '') : source, { gfm: true });
body = body.replace(/^<h1[^>]*>[\s\S]*?<\/h1>\s*/, '');
body = body.replace(/<h([23])>([\s\S]*?)<\/h\1>/g, (_, depth, text) => {
  if (depth === '2') { major += 1; minor = 0; } else { minor += 1; }
  const id = depth === '2' ? `section-${major}` : `section-${major}-${minor}`;
  headings.push({ depth: Number(depth), id, parent: major, text: plain(text) });
  return `<h${depth} id="${id}" tabindex="-1">${text}</h${depth}>`;
});
body = body.replace(/<table>/g, '<div class="table-wrap" tabindex="0" role="region" aria-label="可横向滚动的数据表"><table>').replace(/<\/table>/g, '</table></div>');
const pieces = body.split(/(?=<h2 id="section-\d+" tabindex="-1">)/);
const intro = pieces.shift();
const sections = pieces.map((part, index) => `<section class="doc-section" data-section="${index + 1}">${part}</section>`).join('\n');
const toc = headings.map(h => `<a class="toc-link level-${h.depth}" href="#${h.id}" data-parent="${h.parent}">${escape(h.text)}</a>`).join('\n');

const html = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="${escape(subtitle)}">
  <meta name="jarvis-source-sha256" content="${sourceHash}">
  <title>${escape(title)}</title>
  <script>try{document.documentElement.dataset.theme=localStorage.getItem('jarvis-doc-theme')||(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light')}catch(e){document.documentElement.dataset.theme='light'}</script>
  <style>
    :root{color-scheme:light;--bg:#f4f6f4;--paper:#fff;--ink:#172722;--muted:#53665d;--line:#dce5df;--accent:#176f53;--soft:#eaf5ee;--code:#f0f4f1;--nav:#f9fbf9;--shadow:0 10px 32px #15372909}
    :root[data-theme=dark]{color-scheme:dark;--bg:#101a16;--paper:#17241d;--ink:#e4eee7;--muted:#b0c0b6;--line:#33483b;--accent:#8edbb3;--soft:#203e2d;--code:#112018;--nav:#132019;--shadow:0 10px 32px #0003}
    *{box-sizing:border-box}html{scroll-behavior:smooth;scroll-padding-top:84px}body{margin:0;background:var(--bg);color:var(--ink);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei","PingFang SC",sans-serif;line-height:1.85;font-size:15px}
    a{color:var(--accent);text-decoration-thickness:1px;text-underline-offset:3px}button,input{font:inherit}button{cursor:pointer}button:focus-visible,a:focus-visible,input:focus-visible,.table-wrap:focus-visible{outline:3px solid var(--accent);outline-offset:3px}
    .skip{position:fixed;top:-80px;left:20px;z-index:30;background:var(--paper);padding:8px 16px;border:1px solid var(--line)}.skip:focus{top:10px}
    .topbar{height:64px;position:fixed;inset:0 0 auto;z-index:20;background:var(--paper);border-bottom:1px solid var(--line);display:flex;align-items:center;justify-content:space-between;padding:0 28px;gap:16px}
    .brand{display:flex;align-items:center;gap:12px;min-width:0}.logo{display:grid;place-items:center;width:34px;height:34px;background:var(--accent);color:var(--paper);border-radius:10px;font-weight:800;flex-shrink:0}.brand-name{font-weight:750;letter-spacing:.05em}.version{font-size:12px;color:var(--muted);padding:2px 8px;border:1px solid var(--line);border-radius:6px;white-space:nowrap}
    .tools{display:flex;align-items:center;gap:8px}.tool{display:inline-flex;align-items:center;justify-content:center;padding:6px 12px;min-height:36px;border:1px solid var(--line);border-radius:7px;background:var(--paper);color:var(--ink);font-size:13px;text-decoration:none;white-space:nowrap}.tool:hover{background:var(--soft)}.menu-toggle{display:none}
    .sidebar{position:fixed;left:0;top:64px;bottom:0;width:278px;background:var(--nav);border-right:1px solid var(--line);display:flex;flex-direction:column;padding:24px 18px;z-index:15}.sidebar-label{font-size:11px;color:var(--muted);font-weight:700;letter-spacing:.16em;margin:0 8px 12px}.search-label{display:block;font-size:12px;color:var(--muted);margin-bottom:5px}.search{width:100%;padding:9px 11px;border:1px solid var(--line);border-radius:7px;background:var(--paper);color:var(--ink);font-size:13px}.search-status{font-size:11px;color:var(--muted);min-height:26px;margin:4px 2px 7px}.toc{overflow:auto;flex:1;scrollbar-width:thin;padding-right:4px}.toc-link{display:block;padding:6px 9px;line-height:1.5;font-size:12px;color:var(--muted);text-decoration:none;border-radius:5px;border-left:2px solid transparent;margin-bottom:2px}.toc-link.level-2{font-size:13px;font-weight:650;color:var(--ink);margin-top:9px}.toc-link.level-3{padding-left:19px}.toc-link:hover,.toc-link[aria-current]{background:var(--soft);color:var(--accent);border-left-color:var(--accent)}.sidebar-foot{padding:14px 8px 0;border-top:1px solid var(--line);font-size:11px;color:var(--muted);margin-top:14px}
    .layout{margin-left:278px;padding:98px 36px 64px}.document{max-width:1120px;margin:0 auto}.hero{position:relative;padding:35px 38px 30px;background:var(--paper);border:1px solid var(--line);border-radius:13px 13px 0 0;box-shadow:var(--shadow);border-top:4px solid var(--accent)}.eyebrow{color:var(--accent);font-size:12px;letter-spacing:.15em;font-weight:750;margin:0 0 12px}.hero h1{font-size:clamp(25px,2.8vw,36px);line-height:1.4;letter-spacing:-.02em;margin:0 0 15px;font-weight:750}.subtitle{font-size:16px;color:var(--muted);margin:0;max-width:780px}.meta{display:flex;gap:10px 16px;flex-wrap:wrap;margin-top:20px;font-size:12px;color:var(--muted)}.meta span{display:inline-flex;align-items:center;gap:6px}.dot{height:6px;width:6px;border-radius:50%;background:var(--accent)}.stats{display:grid;grid-template-columns:repeat(3,1fr);margin-top:25px;padding-top:20px;border-top:1px solid var(--line)}.stat+.stat{border-left:1px solid var(--line);padding-left:24px}.stat strong{font-size:24px;line-height:1.3;display:block;font-weight:750}.stat span{font-size:12px;color:var(--muted)}
    .article{padding:14px 38px 38px;background:var(--paper);border:1px solid var(--line);border-top:0;border-radius:0 0 13px 13px;min-width:0}.intro blockquote{margin:20px 0 30px}.doc-section{border-top:1px solid var(--line);margin-top:34px;padding-top:18px}.doc-section[hidden],.toc-link[hidden]{display:none!important}h2{font-size:23px;line-height:1.5;margin:8px 0 20px;font-weight:750;color:var(--ink)}h3{font-size:17px;margin:27px 0 12px;font-weight:700;line-height:1.5}p{margin:12px 0}ul,ol{padding-left:25px;margin:14px 0}li{padding-left:3px;margin:6px 0}li p{margin:6px 0}strong{font-weight:700}blockquote{padding:14px 18px;border-left:3px solid var(--accent);background:var(--soft);color:var(--muted);border-radius:0 7px 7px 0;margin-left:0;margin-right:0;font-size:13px}blockquote p{margin:5px 0}
    .table-wrap{max-width:100%;overflow:auto;margin:18px 0 22px;border:1px solid var(--line);border-radius:8px;scrollbar-width:thin}table{width:100%;border-collapse:collapse;font-size:13px;line-height:1.75}th,td{padding:12px 14px;vertical-align:top;text-align:left;border-bottom:1px solid var(--line);min-width:115px;overflow-wrap:anywhere}th{background:var(--soft);font-size:12px;font-weight:700;position:sticky;top:0;color:var(--ink)}td:first-child{font-weight:600}tr:last-child td{border-bottom:0}tbody tr:nth-child(even){background:var(--nav)}pre{overflow:auto;padding:20px 22px;background:var(--code);border:1px solid var(--line);border-radius:8px;font-size:13px;line-height:1.8;tab-size:4}code{font-family:Consolas,"SFMono-Regular","Microsoft YaHei",monospace;font-size:.92em}p code,li code{background:var(--code);padding:2px 5px;border-radius:4px}pre code{font-size:inherit}.no-results{padding:30px;border:1px dashed var(--line);border-radius:8px;margin-top:25px;color:var(--muted)}.no-results[hidden]{display:none}.footer{font-size:12px;color:var(--muted);padding:23px 5px 0;display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap}.overlay{display:none}.reading-progress{position:fixed;top:63px;left:278px;height:2px;width:0;background:var(--accent);z-index:25}
    @media(max-width:1180px){.sidebar{width:246px}.layout{margin-left:246px;padding-left:24px;padding-right:24px}.reading-progress{left:246px}.hero,.article{padding-left:26px;padding-right:26px}body{font-size:14px}}
    @media(max-width:820px){html{scroll-padding-top:80px}.topbar{padding:0 15px;gap:8px}.brand{gap:8px}.brand-name{font-size:14px}.version{display:none}.menu-toggle{display:inline-flex}.tools{gap:5px}.tool{padding:6px 9px;font-size:12px}.source-tool{display:none}.sidebar{width:min(310px,85vw);transform:translateX(-101%);transition:transform .18s}.sidebar.open{transform:translateX(0)}.overlay.open{display:block;position:fixed;inset:64px 0 0;background:#0005;z-index:14;border:0;padding:0}.layout{margin-left:0;padding:84px 14px 35px}.reading-progress{left:0}.hero{padding:25px 20px}.hero h1{font-size:25px}.subtitle{font-size:14px}.article{padding:5px 20px 25px}.stats{gap:8px}.stat strong{font-size:21px}.stat+.stat{padding-left:13px}.stat span{font-size:11px}h2{font-size:20px}h3{font-size:16px}.doc-section{margin-top:28px;padding-top:16px}th,td{min-width:135px;padding:10px 12px}pre{font-size:12px;padding:15px}.footer{font-size:11px}}
    @media(max-width:820px){.sidebar{transition:none}}
    @media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}.sidebar{transition:none}}
    @media print{:root,:root[data-theme=dark]{color-scheme:light;--paper:#fff;--ink:#111;--muted:#444;--line:#bbb;--accent:#155f46;--soft:#f0f3f0;--code:#f4f4f4;--nav:#fff}body{background:#fff;font-size:10pt;line-height:1.6}.topbar,.sidebar,.overlay,.reading-progress,.skip,.no-results{display:none!important}.layout{margin:0;padding:0}.document{max-width:none}.hero{border:0;border-bottom:1px solid #aaa;border-radius:0;padding:0 0 14px;box-shadow:none}.hero h1{font-size:24pt}.subtitle{font-size:11pt}.stats{margin-top:12px;padding-top:12px}.stat strong{font-size:16pt}.article{border:0;padding:0}.doc-section,.doc-section[hidden]{display:block!important;padding-top:12px;margin-top:20px}h2{font-size:16pt;break-after:avoid}h3{font-size:12pt;break-after:avoid}p,li{orphans:3;widows:3}.table-wrap{overflow:visible;border-radius:0;break-inside:auto}table{font-size:8.5pt;width:100%;table-layout:fixed}th,td{min-width:0;padding:6px 7px;word-break:break-word}thead{display:table-header-group}tr{break-inside:avoid}th{position:static}pre{white-space:pre-wrap;font-size:8.5pt;break-inside:avoid}blockquote{break-inside:avoid}.footer{font-size:8pt}@page{size:A4;margin:16mm}}
  </style>
</head>
<body>
  <a class="skip" href="#main-content">跳至正文</a>
  <header class="topbar">
    <div class="brand"><span class="logo" aria-hidden="true">J</span><span class="brand-name">贾维斯 · 设计文档</span><span class="version">${escape(version)}</span></div>
    <div class="tools">
      <button class="tool menu-toggle" id="menu-toggle" aria-controls="sidebar" aria-expanded="false">目录</button>
      <a class="tool source-tool" href="${encodeURIComponent(basename(input))}">Markdown 源文档</a>
      <button class="tool" id="theme-toggle" aria-pressed="false">切换主题</button>
      <button class="tool" id="print-button">打印</button>
    </div>
  </header>
  <aside class="sidebar" id="sidebar" aria-label="文档导航">
    <p class="sidebar-label">目录与查找</p>
    <label class="search-label" for="search">按关键词筛选章节</label>
    <input class="search" id="search" type="search" placeholder="机器、家人、Skill、监督…" autocomplete="off">
    <div class="search-status" id="search-status" aria-live="polite">共 ${major} 章 · Ctrl / ⌘ + K 查找</div>
    <nav class="toc" aria-label="章节目录">${toc}</nav>
    <div class="sidebar-foot">更新于 ${escape(date)}<br>需求与设计稿 · 可离线浏览</div>
  </aside>
  <button class="overlay" id="overlay" aria-label="关闭目录" tabindex="-1"></button>
  <div class="reading-progress" id="reading-progress" aria-hidden="true"></div>
  <main class="layout" id="main-content" aria-labelledby="document-title">
    <div class="document">
      <header class="hero">
        <p class="eyebrow">${escape(eyebrow)}</p>
        <h1 id="document-title">${escape(title)}</h1>
        <p class="subtitle">${escape(subtitle)}</p>
        <div class="meta"><span><i class="dot" aria-hidden="true"></i>需求与设计稿</span><span>${escape(date)}</span><span>与 Markdown 同源生成</span></div>
        <div class="stats">${statsHtml}</div>
      </header>
      <article class="article">
        <div class="intro">${intro}</div>
        <div class="no-results" id="no-results" hidden>未找到匹配章节。请更换关键词或清空搜索。</div>
        ${sections}
      </article>
      <footer class="footer"><span>Markdown 为内容源 · HTML 为浏览版本</span><a href="${encodeURIComponent(basename(input))}">打开源文档</a></footer>
    </div>
  </main>
  <script>
    const sidebar=document.getElementById('sidebar');
    const menu=document.getElementById('menu-toggle');
    const overlay=document.getElementById('overlay');
    const search=document.getElementById('search');
    const status=document.getElementById('search-status');
    const sections=[...document.querySelectorAll('.doc-section')];
    const links=[...document.querySelectorAll('.toc-link')];
    const themeButton=document.getElementById('theme-toggle');
    const indexed=sections.map(section=>({section,text:section.textContent.toLocaleLowerCase()}));
    const setMenu=open=>{sidebar.classList.toggle('open',open);overlay.classList.toggle('open',open);menu.setAttribute('aria-expanded',String(open))};
    menu.addEventListener('click',()=>setMenu(!sidebar.classList.contains('open')));
    overlay.addEventListener('click',()=>setMenu(false));
    links.forEach(link=>link.addEventListener('click',()=>setMenu(false)));
    search.addEventListener('input',()=>{
      const query=search.value.trim().toLocaleLowerCase();
      const visible=new Set();
      indexed.forEach(({section,text})=>{const matches=!query||text.includes(query);section.hidden=!matches;if(matches)visible.add(section.dataset.section)});
      links.forEach(link=>{link.hidden=!visible.has(link.dataset.parent)});
      document.getElementById('no-results').hidden=visible.size!==0;
      status.textContent=query?'匹配 '+visible.size+' / '+sections.length+' 章':'共 '+sections.length+' 章 · Ctrl / ⌘ + K 查找';
    });
    document.addEventListener('keydown',event=>{if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k'){event.preventDefault();if(matchMedia('(max-width:820px)').matches)setMenu(true);search.focus()}if(event.key==='Escape')setMenu(false)});
    const updateThemeButton=()=>{const dark=document.documentElement.dataset.theme==='dark';themeButton.textContent=dark?'浅色':'深色';themeButton.setAttribute('aria-pressed',String(dark));themeButton.setAttribute('aria-label',dark?'切换浅色主题':'切换深色主题')};
    themeButton.addEventListener('click',()=>{const next=document.documentElement.dataset.theme==='dark'?'light':'dark';document.documentElement.dataset.theme=next;try{localStorage.setItem('jarvis-doc-theme',next)}catch(e){}updateThemeButton()});
    updateThemeButton();
    document.getElementById('print-button').addEventListener('click',()=>window.print());
    const updateProgress=()=>{const left=parseFloat(getComputedStyle(document.getElementById('reading-progress')).left)||0;const total=document.documentElement.scrollHeight-innerHeight;const ratio=total>0?Math.min(1,Math.max(0,scrollY/total)):0;document.getElementById('reading-progress').style.width=(innerWidth-left)*ratio+'px'};
    addEventListener('scroll',updateProgress,{passive:true});addEventListener('resize',updateProgress);search.addEventListener('input',updateProgress);updateProgress();
    if('IntersectionObserver' in window){const observer=new IntersectionObserver(entries=>{entries.forEach(entry=>{if(entry.isIntersecting){links.forEach(link=>{if(link.hash==='#'+entry.target.id)link.setAttribute('aria-current','location');else link.removeAttribute('aria-current')})}})},{rootMargin:'-75px 0px -65% 0px'});document.querySelectorAll('.doc-section h2').forEach(heading=>observer.observe(heading))}
    document.querySelectorAll('a[href^="https://"]').forEach(link=>{link.target='_blank';link.rel='noopener noreferrer'});
  </script>
</body>
</html>`;

await writeFile(output, html, 'utf8');
console.log(JSON.stringify({ markdown: input, html: output, sections: major, headings: headings.length, sourceSha256: sourceHash, bytes: Buffer.byteLength(html) }, null, 2));
