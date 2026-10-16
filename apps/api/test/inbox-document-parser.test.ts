import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
import {parseInboxDocument} from '../src/runtime/inbox-document-parser.js';
import {knowledgeLocalHealth} from '../src/runtime/knowledge-ocr.js';
import {BusinessError} from '../src/v1/types.js';

const execute=promisify(execFile),python=process.env.JARVIS_KNOWLEDGE_PYTHON??process.env.JARVIS_PYTHON??'python';
const DOCX='application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const hash=(bytes:Buffer|string)=>createHash('sha256').update(bytes).digest('hex');
const generator=String.raw`import sys,zipfile
from pathlib import Path
target=Path(sys.argv[1]); target.mkdir(parents=True,exist_ok=True)
types='<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'
prefix='<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>'
suffix='</w:body></w:document>'
def docx(filename,body,extras=None):
    with zipfile.ZipFile(target/filename,'w',zipfile.ZIP_DEFLATED) as archive:
        archive.writestr('[Content_Types].xml',types)
        archive.writestr('_rels/.rels','<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>')
        archive.writestr('word/document.xml',body)
        for name,data in (extras or {}).items(): archive.writestr(name,data)
body=prefix+'<w:p><w:r><w:t xml:space="preserve">  JARVIS </w:t></w:r><w:r><w:t>DOCX 原文🎵</w:t><w:tab/><w:t>同段文字</w:t><w:br/><w:t xml:space="preserve">换行  </w:t></w:r><w:del><w:r><w:delText>DELETED-CONTENT</w:delText></w:r></w:del></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>表格正文 &amp; 真值</w:t></w:r></w:p></w:tc></w:tr></w:tbl><w:p/><w:p><w:hyperlink><w:r><w:t>链接的显示文字</w:t></w:r></w:hyperlink></w:p>'+suffix
docx('original.docx',body)
docx('long.docx',prefix+'<w:p><w:r><w:t>'+'🎵'*70000+'</w:t></w:r></w:p>'+suffix)
docx('unsafe.docx','<!DOCTYPE w:document [<!ENTITY old "ENTITY-CONTENT">]>'+prefix+'<w:p><w:r><w:t>&old;</w:t></w:r></w:p>'+suffix)
docx('unsafe-utf16.docx',('<?xml version="1.0" encoding="UTF-16"?><!DOCTYPE w:document [<!ENTITY old "ENTITY-CONTENT">]>'+prefix+'<w:p><w:r><w:t>&old;</w:t></w:r></w:p>'+suffix).encode('utf-16'))
docx('traversal.docx',body,{'../outside.txt':'NEVER EXTRACT'})
docx('expanded.docx',body,{'word/large.bin':b'x'*(65*1024*1024)})
docx('paragraph-limit.docx',prefix+('<w:p><w:r><w:t>word</w:t></w:r></w:p>'*2001)+suffix)
(target/'corrupt.docx').write_bytes((target/'original.docx').read_bytes()[:-20])
if len(sys.argv)>2:
    import pymupdf
    document=pymupdf.open()
    for number in [1,2]:
        page=document.new_page(width=595,height=400)
        page.insert_text((48,80),'JARVIS STUDY PAGE '+str(number),fontsize=30)
        page.insert_text((48,140),'Learning requires thought.',fontsize=22)
        page.insert_text((48,200),'学习与思考',fontname='china-s',fontsize=25)
    document.save(str(target/'original.pdf'))
    document.save(str(target/'encrypted.pdf'),encryption=pymupdf.PDF_ENCRYPT_AES_256,owner_pw='synthetic-owner',user_pw='synthetic-user')
    pix=document[0].get_pixmap(dpi=144,alpha=False); pix.save(str(target/'scan.png'))
    scan=pymupdf.open(); page=scan.new_page(width=595,height=400);page.insert_image(page.rect,stream=pix.tobytes('png'));scan.save(str(target/'scan.pdf'))
print('created isolated original fixtures')
`;
async function fixture(pdf=false){
 const directory=await mkdtemp(join(tmpdir(),'jarvis-inbox-parser-test-')),script=join(directory,'make.py');
 try{await writeFile(script,generator);await execute(python,[script,directory,...(pdf?['pdf']:[])],{windowsHide:true,timeout:30000,maxBuffer:65536,env:{...process.env,PYTHONIOENCODING:'utf-8'}})}catch(error){await rm(directory,{recursive:true,force:true});throw error;}
 return {directory,async parse(filename:string,mime:string,options:Partial<Parameters<typeof parseInboxDocument>[0]>={}){const bytes=await readFile(join(directory,filename)),before=hash(bytes);try{return await parseInboxDocument({bytes,mime,sha256:before,pythonExecutable:python,...options})}finally{assert.equal(hash(bytes),before);assert.equal(hash(await readFile(join(directory,filename))),before)}},async close(){const target=resolve(directory);assert.ok(target.startsWith(resolve(tmpdir())+sep)&&target.includes('jarvis-inbox-parser-test-'));await rm(target,{recursive:true,force:true,maxRetries:10,retryDelay:100});}};
}
async function pythonAvailable(){try{await execute(python,['-c','import zipfile,xml.etree.ElementTree,html.parser'],{windowsHide:true,timeout:10000});return true}catch{return false}}

test('actual DOCX body preserves paragraphs, spaces, table text and original fingerprints without invented pages',{timeout:60000},async t=>{
 if(!await pythonAvailable()){t.skip('Local Python is unavailable; no document extraction was verified');return}
 const f=await fixture();try{
  const result=await f.parse('original.docx',DOCX);assert.equal(result.pageCount,null);assert.equal(result.engine,'python-stdlib-docx-body');assert.equal(result.reviewRequired,true);assert.equal(result.textTruncated,false);
  assert.deepEqual(result.segments.map(segment=>segment.paragraph),[1,2,4]);assert.ok(result.segments.every(segment=>segment.page===null));assert.equal(result.segments[0].text,'  JARVIS DOCX 原文🎵\t同段文字\n换行  ');assert.equal(result.segments[1].text,'表格正文 & 真值');assert.equal(result.segments[2].text,'链接的显示文字');assert.doesNotMatch(result.text,/DELETED-CONTENT/);
  for(const segment of result.segments){assert.equal(segment.sha256,hash(segment.text));assert.equal(segment.location,`inbox-original://${result.sha256}/paragraph/${segment.paragraph}`)}assert.equal(result.text,result.segments.map(segment=>segment.text).join('\n\n'));assert.ok(result.warnings.some(warning=>warning.includes('页眉页脚')));
  const long=await f.parse('long.docx',DOCX);assert.equal(long.text.length,120000);assert.equal(long.textTruncated,true);assert.ok(!/[\uD800-\uDBFF]$/.test(long.text));assert.ok(long.warnings.some(warning=>warning.includes('120000')));
 }finally{await f.close();}
});

test('actual embedded PDF and image-only PDF/PNG use the existing local OCR with original page locations',{timeout:120000},async t=>{
 const health=await knowledgeLocalHealth(python);if(!health.available){t.skip('Local OCR dependencies unavailable; no actual scan extraction claimed');return}
 const f=await fixture(true);try{
  const embedded=await f.parse('original.pdf','application/pdf');assert.equal(embedded.pageCount,2);assert.deepEqual(embedded.segments.map(segment=>segment.page),[1,2]);assert.equal(embedded.engine,'pymupdf-embedded-text');assert.match(embedded.segments[0].text,/JARVIS STUDY PAGE 1/);assert.match(embedded.segments[1].text,/JARVIS STUDY PAGE 2/);
  for(const [filename,mime] of [['scan.png','image/png'],['scan.pdf','application/pdf']]){const result=await f.parse(filename,mime);assert.equal(result.pageCount,1);assert.match(result.engine,/rapidocr/);assert.match(result.text,/JARVIS|STUDY/i);assert.match(result.text,/学习|思考/);assert.equal(result.reviewRequired,true);assert.equal(result.segments[0].location,`inbox-original://${result.sha256}/page/1`);assert.equal(result.segments[0].sha256,hash(result.segments[0].text));}
  await assert.rejects(()=>f.parse('original.pdf','application/pdf',{maxPages:1}),(error:any)=>error.code==='OCR_ENGINE_ERROR');await assert.rejects(()=>f.parse('encrypted.pdf','application/pdf'),(error:any)=>error.code==='OCR_ENGINE_ERROR');
 }finally{await f.close();}
});

test('DOCX unsafe XML, path traversal, decompression and paragraph limits reject while keeping originals',{timeout:60000},async t=>{
 if(!await pythonAvailable()){t.skip('Local Python unavailable; document protection cases not executed');return}
 const f=await fixture();try{
  for(const [filename,code] of [['unsafe.docx','DOCX_XML_UNSAFE'],['unsafe-utf16.docx','DOCX_XML_UNSAFE'],['traversal.docx','DOCX_INVALID'],['expanded.docx','DOCX_LIMIT'],['paragraph-limit.docx','DOCX_LIMIT'],['corrupt.docx','DOCX_INVALID']])await assert.rejects(()=>f.parse(filename,DOCX),(error:any)=>error instanceof BusinessError&&error.code===code,filename);
 }finally{await f.close();}
});

test('actual static HTML selects article text, decodes entities and excludes active/navigation/form content',{timeout:30000},async t=>{
 if(!await pythonAvailable()){t.skip('Local Python unavailable; HTML extraction not executed');return}
 const html='<!doctype html><html><head><title>测试 &amp; 原题</title><style>HIDDEN-STYLE</style></head><body><header>HIDDEN-HEADER</header><nav>HIDDEN-NAV</nav><main><p>OUTSIDE-ARTICLE</p><article><h1>正文标题</h1><p>原文 &amp; 实体 &#x1F3B5;</p><p>第二段<strong>粗体</strong>正文。</p><script>fetch("https://never.example.test/"); HIDDEN-SCRIPT</script><noscript>HIDDEN-NOSCRIPT</noscript><template>HIDDEN-TEMPLATE</template><svg><text>HIDDEN-SVG</text></svg><form><p>HIDDEN-FORM</p><input value="hidden"></form><footer>HIDDEN-FOOTER</footer></article></main></body></html>',bytes=Buffer.from(html),sha256=hash(bytes);
 const result=await parseInboxDocument({bytes,mime:'text/html',sha256,pythonExecutable:python});assert.equal(result.title,'测试 & 原题');assert.equal(result.pageCount,null);assert.deepEqual(result.segments.map(segment=>segment.paragraph),[1,2,3]);assert.equal(result.text,'正文标题\n\n原文 & 实体 🎵\n\n第二段粗体正文。');assert.doesNotMatch(result.text,/HIDDEN|OUTSIDE|fetch/);assert.ok(result.segments.every(segment=>segment.page===null&&segment.location.startsWith(`inbox-original://${sha256}/paragraph/`)));assert.ok(result.warnings.includes('正文选择：article'));assert.equal(hash(bytes),sha256);
 const fallback=Buffer.from('<html><body><p>正文回退</p><p>第二段 &lt;标签&gt;</p></body></html>'),body=await parseInboxDocument({bytes:fallback,mime:'text/html',sha256:hash(fallback),pythonExecutable:python});assert.equal(body.text,'正文回退\n\n第二段 <标签>');assert.ok(body.warnings.includes('正文选择：body'));
 const bad=Buffer.from([0xff,0xfe,0,60,0,62]);await assert.rejects(()=>parseInboxDocument({bytes:bad,mime:'text/html',sha256:hash(bad),pythonExecutable:python}),(error:any)=>error.code==='HTML_INVALID_UTF8');
});

test('parser refuses changed hashes, missing environment, cancellation and actual worker timeout without scratch residue',{timeout:30000},async t=>{
 if(!await pythonAvailable()){t.skip('Local Python unavailable; worker boundary checks not executed');return}
 const before=(await readdir(tmpdir())).filter(name=>name.startsWith('jarvis-inbox-document-')).sort(),f=await fixture();try{
  await assert.rejects(()=>f.parse('original.docx',DOCX,{sha256:'0'.repeat(64)}),(error:any)=>error.code==='CONFLICT');
  await assert.rejects(()=>f.parse('original.docx','audio/webm'),(error:any)=>error.code==='VALIDATION');
  await assert.rejects(()=>f.parse('original.docx',DOCX,{pythonExecutable:join(f.directory,'missing-python')}),(error:any)=>error.code==='NOT_CONFIGURED');
  const controller=new AbortController();controller.abort();await assert.rejects(()=>f.parse('original.docx',DOCX,{signal:controller.signal}),(error:any)=>error.code==='CANCELLED');
  await assert.rejects(()=>f.parse('original.docx',DOCX,{timeoutMs:1}),(error:any)=>error.code==='DOCUMENT_PARSE_TIMEOUT');
 }finally{await f.close();}
 assert.deepEqual((await readdir(tmpdir())).filter(name=>name.startsWith('jarvis-inbox-document-')).sort(),before);
});

test('scan runner preserves real PDF/image extraction and settles timeout or cancellation before scratch cleanup',{timeout:60000},async t=>{
 const health=await knowledgeLocalHealth(python);if(!health.available){t.skip('Local OCR unavailable; updated scan runner not verified');return}
 const before=(await readdir(tmpdir())).filter(name=>name.startsWith('jarvis-inbox-document-')).sort(),f=await fixture(true);try{
  const pdf=await f.parse('original.pdf','application/pdf');assert.equal(pdf.pageCount,2);assert.equal(pdf.engine,'pymupdf-embedded-text');assert.deepEqual(pdf.segments.map(segment=>segment.page),[1,2]);assert.match(pdf.text,/JARVIS STUDY PAGE 2/);
  const image=await f.parse('scan.png','image/png');assert.equal(image.pageCount,1);assert.match(image.engine,/rapidocr/);assert.match(image.text,/学习|思考/);
  await assert.rejects(()=>f.parse('scan.png','image/png',{timeoutMs:1}),(error:any)=>error.code==='OCR_TIMEOUT');
  const controller=new AbortController(),pending=f.parse('scan.png','image/png',{signal:controller.signal});const timer=setTimeout(()=>controller.abort(),30);try{await assert.rejects(pending,(error:any)=>error.code==='CANCELLED')}finally{clearTimeout(timer)}
 }finally{await f.close();}
 assert.deepEqual((await readdir(tmpdir())).filter(name=>name.startsWith('jarvis-inbox-document-')).sort(),before);
});
