import {createHash} from 'node:crypto';
import type {V1Repository} from '../v1/repository.js';
import {publishedKnowledgeDocumentEntries} from './knowledge-documents.js';
import {searchKnowledgeDocuments, type KnowledgeDocument} from './knowledge-connectors.js';

const hash=(text:string)=>createHash('sha256').update(text).digest('hex');
const string=(value:unknown)=>typeof value==='string'?value:'';
const segment=(value:unknown)=>encodeURIComponent(String(value));
const bookLocation=(book:any,page:unknown)=>`book://${segment(book.id)}/${segment(book.version)}/page/${segment(page)}`;

/** Ranking is deterministic word/Chinese-fragment matching, without embeddings or a model. */
function ranked(documents:KnowledgeDocument[],query:string){
  if(!query.trim())return [];
  return searchKnowledgeDocuments(documents,query,documents.length);
}

/** Read the current authorization and complete text on every call, before ranking or limiting. */
export function searchAuthorizedKnowledge(repository:V1Repository,actorId:string,query:string,familyOnly=false){
  const sources=repository.list('sources',actorId).filter(s=>s.kind==='source'&&s.active&&s.authorized&&(!familyOnly||s.scope==='family'));
  const books=repository.list('books',actorId).filter(b=>b.kind==='book'&&b.status==='published'&&(!familyOnly||b.scope==='family')&&sources.some(s=>s.id===b.source&&s.scope===b.scope));
  const documents:KnowledgeDocument[]=[];
  for(const book of books)for(const page of book.pageTexts??[]){
    const text=string(page.text);if(!text.trim())continue;
    documents.push({id:`${book.id}-page-${page.page}`,title:book.title,text,location:bookLocation(book,page.page),sha256:hash(text),metadata:{id:book.id,kind:'book',source:book.source,book:book.id,page:page.page,version:book.version,revision:book.revision,quoteKind:'published-original'}});
  }
  for(const story of repository.list('stories',actorId).filter(s=>s.kind==='story'&&s.status==='published'&&s.released&&!s.dirty&&(!familyOnly||s.scope==='family'))){
    const book=books.find(b=>b.id===story.book&&b.version===story.version),page=book?.pageTexts?.find((p:any)=>p.page===story.page),originalQuote=string(story.quote);
    if(!book||!originalQuote||!string(page?.text).includes(originalQuote))continue;
    const fields:[string,string][]=[['quote',originalQuote],['summary',string(story.summary)],...(story.sections??[]).map((text:unknown,index:number)=>[`sections/${index}`,string(text)] as [string,string])];
    for(const [field,text] of fields){if(!text.trim())continue;
      documents.push({id:`${story.id}-${field}`,title:story.title,text,location:`story://${segment(story.id)}/revision/${story.revision}/${field}`,sha256:hash(text),metadata:{id:story.id,kind:'story',source:book.source,book:book.id,page:story.page,version:story.version,revision:story.revision,matchedField:field,quoteKind:field==='quote'?'published-original':'reviewed-interpretation',originalQuote,originalLocation:bookLocation(book,story.page),originalOffset:string(page.text).indexOf(originalQuote),originalSha256:hash(string(page.text))}});
    }
  }
  for(const doc of publishedKnowledgeDocumentEntries(repository,actorId,familyOnly?'family':undefined))for(const part of doc.segments){
    if(!sources.some(s=>s.id===doc.sourceId&&s.scope===doc.scope))continue;
    documents.push({id:`${doc.id}-segment-${part.index}`,title:doc.title,text:part.text,location:`document://${segment(doc.id)}/${doc.version}/segment/${part.index}`,sha256:part.sha256,metadata:{id:doc.id,kind:'knowledge-document',documentId:doc.id,segment:part.index,source:doc.sourceId,sourceRevision:doc.sourceRevision,revision:doc.revision,version:doc.version,quoteKind:'reviewed-document'}});
  }
  for(const source of sources)for(const document of source.documents??[]){
    const text=string(document.text);if(!text.trim())continue;
    documents.push({id:`${source.id}-${document.id}`,title:string(document.title),text,location:string(document.location),sha256:hash(text),metadata:{id:document.id,kind:'external-document',source:source.id,sourceName:source.name,sourceRevision:source.revision,version:source.version,quoteKind:'external-source-unreviewed'}});
  }
  return ranked(documents,query).map(d=>({...d.metadata,title:d.title,text:d.quote,quote:d.quote,location:d.location,sha256:d.sha256,offset:d.offset,score:d.score}));
}

/** A due review date is a reminder, not expiry. Only current confirmed memory is eligible. */
export function searchAuthorizedMemories(repository:V1Repository,actorId:string,query:string){
  const records=repository.list('memory',actorId,'private').filter(r=>r.kind==='memory'&&r.profileId==='me'&&r.status==='active');
  const documents:KnowledgeDocument[]=[];
  for(const memory of records){
    // Never index history or previousTexts: edits and forgetting must remove old recall.
    const historicalEvidence=(memory.history??[]).some((event:any)=>event?.event==='edited-confirmed');
    // The edit command confirms new text but deliberately retains the old provenance.
    // Preserve that evidence for traceability without using it to recall an outdated fact.
    const fields=historicalEvidence?['text']:['text','source','evidenceQuote','evidence'];
    for(const field of fields){const text=string(memory[field]);if(!text.trim())continue;
      documents.push({id:`${memory.id}-${field}`,title:[string(memory.title),string(memory.category)].filter(Boolean).join(' '),text,location:`memory://${segment(memory.id)}/revision/${memory.revision}/${field}`,sha256:hash(text),metadata:{id:memory.id,kind:'memory',text:memory.text,category:memory.category,source:memory.source,sourceEvidenceStatus:historicalEvidence?'historical-before-edit':'current-confirmation',...(historicalEvidence?{sourceEvidenceNotice:'来源为修订前保留的历史证据，不参与现行召回；当前文字已由本人更正确认。'}:{}),revision:memory.revision,confirmedAt:memory.confirmedAt,nextReviewAt:memory.nextReviewAt,matchedField:field}});
    }
  }
  const seen=new Set<string>();
  return ranked(documents,query).filter(d=>{const id=String(d.metadata.id);if(seen.has(id))return false;seen.add(id);return true;}).map(d=>({...d.metadata,quote:d.quote,location:d.location,sha256:d.sha256,offset:d.offset,score:d.score}));
}
