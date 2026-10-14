import {readFile,writeFile} from 'node:fs/promises';
const file=new URL('../prototype-v12/theme-polish.css',import.meta.url);
let css=await readFile(file,'utf8');
const hero=`html[data-j7-theme="hero"] {
  --tp-panel:#172432;--tp-raised:#223444;--tp-input:#101b27;--tp-ink:#edf1f4;--tp-muted:#b3c4d2;
  --tp-line:#647d91;--tp-accent:#efc779;--tp-soft:#303d45;--tp-secondary:#8bc9e8;--tp-on-accent:#18212a;--tp-radius:5px;
  --tp-shadow:inset 0 1px #bcdcf019,0 6px 22px #020b1444;
  --tp-good:#b6ead0;--tp-good-bg:#173c32;--tp-good-line:#568878;
  --tp-warn:#ffe0a4;--tp-warn-bg:#403321;--tp-warn-line:#9b8051;
  --tp-bad:#ffc0c9;--tp-bad-bg:#412630;--tp-bad-line:#976173;
  --tp-board-panel:#172432;--tp-board-raised:#223444;--tp-board-ink:#edf1f4;--tp-board-muted:#b3c4d2;
  --j7-nav-text:#e1ecf4;--j7-nav-dim:#acbdcc;--j7-nav-line:#526b81;
}`;
css=css.replace(/html\[data-j7-theme="hero"\] \{[\s\S]*?\n\}/,hero);
const baijia=`html[data-j7-theme="baijia"] {
  --tp-panel:#f8f3e9;--tp-raised:#e7dfcd;--tp-input:#fffaf0;--tp-ink:#2f3830;--tp-muted:#63705e;
  --tp-line:#8e9b81;--tp-accent:#476858;--tp-soft:#dde5d6;--tp-secondary:#a74332;--tp-on-accent:#fffaeb;
  --tp-radius:4px;--tp-shadow:0 5px 22px #58492a13;
  --tp-good:#356345;--tp-good-bg:#e2ebd9;--tp-good-line:#98b58b;
  --tp-warn:#7f5b25;--tp-warn-bg:#f0e4bd;--tp-warn-line:#b5a06a;
  --tp-bad:#a74332;--tp-bad-bg:#f2ded1;--tp-bad-line:#bb8a77;
  --tp-board-panel:#f8f3e9;--tp-board-raised:#e7dfcd;--tp-board-ink:#2f3830;--tp-board-muted:#63705e;
  --j7-nav-text:#334f40;--j7-nav-dim:#64735e;--j7-nav-line:#8e9b81;
}`;
css=css.replace(/html\[data-j7-theme="baijia"\] \{[\s\S]*?\n\}/,baijia);
css=css.replace(/html\[data-j7-theme="hero"\] body\.screen-mode \{[\s\S]*?\n\}/,`html[data-j7-theme="hero"] body.screen-mode {
  --tp-panel:#172432;--tp-raised:#223444;--tp-input:#101b27;--tp-ink:#edf1f4;--tp-muted:#b3c4d2;--tp-line:#647d91;
  --tp-accent:#efc779;--tp-soft:#303d45;--tp-secondary:#8bc9e8;--tp-on-accent:#18212a;
}`);
css=css.replace('background:#f5eadb;border-color:#cdbfb0','background:var(--tp-raised);border-color:var(--tp-line)');
css=css.replace('color:#2d241c;background:#efbc5b','color:var(--tp-on-accent);background:var(--tp-accent)');
css=css.replaceAll('V11 surface','V12 surface').replace('bronze manuscripts and warm light in a deep green academy','warm paper, poetry and academy lanterns');
css=css.replaceAll('html:is([data-j7-theme="pantheon"],[data-j7-theme="shanshui"],[data-j7-theme="baijia"])', 'html:is([data-j7-theme="hero"],[data-j7-theme="pantheon"],[data-j7-theme="shanshui"],[data-j7-theme="baijia"])');
css+='\nhtml[data-j7-tone="dark"] .j7-design-card[style*="#476858"] {--design-accent:#bdd1b5!important}\n';
await writeFile(file,css,'utf8');
console.log('Avengers and academy tokens prepared.');
