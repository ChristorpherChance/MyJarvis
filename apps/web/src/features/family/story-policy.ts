/** Voice uses the same approved, current original versions as the knowledge domain. */
export function voiceStoryReady(data:any,story:any,profile:string){
 const book=data.knowledge?.books?.find((b:any)=>b.id===story.book);
 const source=data.knowledge?.sources?.find((s:any)=>s.id===book?.source);
 return !!book&&!!source&&source.active===true&&source.authorized===true&&(source.scope==='family'||profile==='me')&&(!book.scope||book.scope==='family'||profile==='me')&&book.status==='published'&&book.stage===6&&!!book.published&&story.released===true&&!story.dirty&&story.version===book.version;
}
export function voiceStories(data:any,profile:string):any[]{return (data.knowledge?.stories||[]).filter((story:any)=>voiceStoryReady(data,story,profile))}
