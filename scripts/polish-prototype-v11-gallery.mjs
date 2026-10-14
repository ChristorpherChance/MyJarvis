import fs from 'node:fs/promises';
const source = new URL('../prototype-v11/cinematic.js', import.meta.url);
const text = await fs.readFile(source, 'utf8');
const needle = "d.short+'灵感</strong>";
if (text.split(needle).length !== 2) throw new Error('Expected one gallery heading');
await fs.writeFile(source, text.replace(needle, "d.short+'</strong>"), 'utf8');
const css = new URL('../prototype-v11/layout.css', import.meta.url);
await fs.appendFile(css, '\n/* Keep all ten comparison headers aligned and legible. */\n.j7-design-card .j7-card-heading {min-height:50px}\n.j7-design-card .j7-card-heading strong {white-space:nowrap;font-size:13px}\n', 'utf8');
await import('./build-prototype-v11.mjs');
