const path=require('node:path');
const fs=require('node:fs/promises');
const sharp=require('C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp');
(async()=>{const p=path.resolve(__dirname,'../prototype-v11/assets'),name=process.argv[2]||'pantheon-assembly';const file=path.join(p,name+'.webp');await sharp(path.join(p,name+'.png')).webp({quality:90,effort:4}).toFile(file);console.log(JSON.stringify({file,bytes:(await fs.stat(file)).size,...await sharp(file).metadata()}))})().catch(e=>{console.error(e.message);process.exitCode=1});
