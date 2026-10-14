import test from 'node:test';
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {decodeEntities,extractPublicPage,parsePublicFeed,plainWebText} from '../src/runtime/web-content.js';

const maxBytes=2*1024*1024;
function repeated(part:string,bytes=maxBytes){return part.repeat(Math.floor(bytes/part.length));}
function bounded<T>(name:string,operation:()=>T):T{
 const started=performance.now(),result=operation(),elapsed=performance.now()-started;
 assert(elapsed<5000,`${name} took ${Math.round(elapsed)}ms; parsing must stay bounded at the allowed source size`);
 return result;
}

test('1–2 MiB unclosed hidden tags, comments, CDATA and ordinary tags finish without scanning suffixes repeatedly',()=>{
 for(const token of ['<script>','<style>','<!--','<![CDATA[','<']){
  for(const size of [1024*1024,maxBytes]){
   const text='visible '+repeated(token,size);
   assert.equal(bounded(`${token} ${size}`,()=>plainWebText(text)),'visible');
  }
 }
 const cdata=repeated('<![CDATA[');
 assert.equal(bounded('unclosed CDATA entity decoding',()=>decodeEntities(cdata)),cdata);
 assert.equal(bounded('closed CDATA decoding',()=>decodeEntities('<![CDATA['+repeated('x')+']]>')),repeated('x'));
});

test('unclosed article/main/body/title and malformed metadata do not block page extraction',()=>{
 for(const token of ['<article>','<main>','<body>','<title>']){
  const html='<html><head><title>safe title</title></head><body>visible '+repeated(token)+'</body></html>';
  const page=bounded(`page ${token}`,()=>extractPublicPage(html,'https://example.com/page'));
  assert.equal(page.title,'safe title');assert.equal(page.text,'visible');
 }
 const meta='<html><body>visible '+repeated('<meta property="not-published">')+'</body></html>';
 assert.equal(bounded('metadata candidate scan',()=>extractPublicPage(meta,'https://example.com')).publishedAt,null);
 const malformed='<html><body>visible '+repeated('<meta property=')+'</body></html>';
 assert.equal(bounded('unclosed metadata scan',()=>extractPublicPage(malformed,'https://example.com')).publishedAt,null);
});

test('RSS and Atom scans bound repeated unclosed items, fields, links and CDATA at 2 MiB',()=>{
 for(const [root,item]of [['rss','item'],['feed','entry']]as const){
  assert.deepEqual(bounded(`${root} unclosed items`,()=>parsePublicFeed(`<${root}>${repeated(`<${item}>`)}</${root}>`,'https://example.com/feed')),[]);
  for(const field of ['<title>','<link>','<![CDATA[','<!--']){
   assert.deepEqual(bounded(`${root} unclosed ${field}`,()=>parsePublicFeed(`<${root}><${item}>${repeated(field)}</${item}></${root}>`,'https://example.com/feed')),[]);
  }
 }
 const atom='<feed><entry><title>safe</title><link href="https://example.com/safe"/><summary>visible '+repeated('<link')+'</summary></entry></feed>';
 const malformedItems=bounded('unclosed Atom link tags',()=>parsePublicFeed(atom,'https://example.com/feed'));
 assert.equal(malformedItems.length,1);assert.equal(malformedItems[0].url,'https://example.com/safe');assert.equal(malformedItems[0].summary,'');
 for(const declaration of ['<!DOCTYPE rss [<!ENTITY x SYSTEM "file:///secret">]>','<!ENTITY x "secret">']){
  const input='<rss>'+repeated('<item>')+declaration+'</rss>';
  bounded('DTD/entity refusal',()=>assert.throws(()=>parsePublicFeed(input,'https://example.com/feed'),(error:any)=>error.code==='WEB_FEED_INVALID'));
 }
});

test('linear extraction preserves safe RSS/Atom fields, CDATA text, dates, script removal and metadata',()=>{
 const rss='<rss><channel><!-- <item><title>fake</title></item> --><item><title><![CDATA[Real &amp; title]]></title><link>https://example.com/real</link><description><![CDATA[<p>Visible &lt;text&gt;</p><script>if (a < b) { fake(); }</script><p>After</p>]]></description><pubDate>2026-10-10T01:00:00Z</pubDate><updated>2026-10-10T02:00:00Z</updated></item></channel></rss>';
 const feed=parsePublicFeed(rss,'https://example.com/feed');
 assert.equal(feed.length,1);assert.equal(feed[0].title,'Real & title');assert.equal(feed[0].summary,'Visible <text>\nAfter');assert.equal(feed[0].sourcePublishedAt,'2026-10-10T01:00:00.000Z');assert.equal(feed[0].sourceUpdatedAt,'2026-10-10T02:00:00.000Z');
 const atom=parsePublicFeed('<feed><entry><title>Atom</title><link rel="self" href="/feed"/><link title="2 > 1" rel="alternate" href="/a?x=1&amp;y=2"/><summary><![CDATA[<p>Summary</p>]]></summary><published>2026-10-10T03:00:00Z</published></entry></feed>','https://example.com/feed');
 assert.equal(atom[0].url,'https://example.com/a?x=1&y=2');assert.equal(atom[0].summary,'Summary');assert.equal(atom[0].sourcePublishedAt,'2026-10-10T03:00:00.000Z');
 const page=extractPublicPage('<html><head><title>Title</title><meta content="2026-10-10T01:00:00Z" property="article:published_time"/></head><body><script>if (a < b) { fake(); }</script><article>Visible<style>.x:before {content: "<"}</style>After</article></body></html>','https://example.com/page');
 assert.equal(page.text,'Visible After');assert.equal(page.publishedAt,'2026-10-10T01:00:00.000Z');assert.equal(page.publicationSource,'page-metadata');
 assert.equal(plainWebText('<p>Visible</p><script>unclosed dangerous content'),'Visible');
 assert.equal(plainWebText('<nav><script>const x="</nav>"; hidden();</script>Menu</nav><p>Visible</p>'),'Visible');
 assert.equal(parsePublicFeed('<rss><item><title>private</title><link>http://127.0.0.1/secret</link></item></rss>','https://example.com/feed').length,0);
});
