import {build} from 'esbuild';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
process.chdir(fileURLToPath(new URL('../',import.meta.url)));
import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';

test('every registered icon renders explicit accessible-neutral SVG without fallback',async()=>{
 const dir=await mkdtemp(resolve('.icons-test-'));
 try{
  const out=join(dir,'icons.mjs');
  await build({entryPoints:[resolve('apps/web/src/icons.tsx')],outfile:out,bundle:true,platform:'node',format:'esm',jsx:'automatic',packages:'external',logLevel:'silent'});
  const {Icon,ICON_NAMES,ROUTE_ICONS}=await import(pathToFileURL(out).href);
  assert.equal(Object.keys(ROUTE_ICONS).length,19);
  assert.equal(new Set(ICON_NAMES).size,ICON_NAMES.length);
  for(const name of ICON_NAMES){
   const html=renderToStaticMarkup(React.createElement(Icon,{name,size:20}));
   assert(html.includes(`data-icon="${name}"`),name);
   assert(html.includes('viewBox="0 0 24 24"'),name);
   assert(html.includes('stroke="currentColor"'),name);
   assert(html.includes('stroke-width="1.5"'),name);
   assert(html.includes('aria-hidden="true"')&&html.includes('focusable="false"'),name);
   assert(/<path d="[^"]+"/.test(html),name);
  }
  for(const name of Object.values(ROUTE_ICONS))assert(ICON_NAMES.includes(name));
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('icon migration preserves mathematical and process text',async()=>{
 const power=await readFile('apps/web/src/features/operations/PowerPanel.tsx','utf8');
 assert(power.includes('×'));
 const dashboard=await readFile('apps/web/src/PlatformDashboards.tsx','utf8');
 assert(dashboard.includes('→'));
 const source=await readFile('apps/web/src/icons.tsx','utf8');
 assert(!source.includes('paths[name]||'));
});
