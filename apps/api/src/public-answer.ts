/** Hide explicit reasoning blocks, including tags divided between streamed deltas. */
export class PublicAnswerFilter{
 private buffer='';private hidden:string[]=[];
 push(delta:string){
  this.buffer+=delta;let output='';
  while(this.buffer){
   const opening=this.buffer.indexOf('<');
   if(opening<0){if(!this.hidden.length)output+=this.buffer;this.buffer='';break;}
   if(opening>0){if(!this.hidden.length)output+=this.buffer.slice(0,opening);this.buffer=this.buffer.slice(opening);}
   const end=this.buffer.indexOf('>');if(end<0){if(this.buffer.length>2048){if(!this.hidden.length&&!this.possibleHiddenTag())output+=this.buffer;this.buffer='';}break;}
   const raw=this.buffer.slice(0,end+1),tag=/^<\s*(\/?)\s*(think|analysis|reasoning)(?:\s[^>]*)?>$/i.exec(raw);this.buffer=this.buffer.slice(end+1);
   if(tag){const name=tag[2].toLowerCase();if(tag[1]){const at=this.hidden.lastIndexOf(name);if(at>=0)this.hidden.length=at;}else this.hidden.push(name);}
   else if(!this.hidden.length)output+=raw;
  }
  return output;
 }
 private possibleHiddenTag(){const value=this.buffer.replace(/^<\s*\/?\s*/,'').toLowerCase();return ['think','analysis','reasoning'].some(name=>name.startsWith(value)||value.startsWith(name));}
 finish(){const visible=!this.hidden.length&&!this.possibleHiddenTag()?this.buffer:'';this.buffer='';this.hidden=[];return visible;}
}
export function publicAnswer(text:string){const filter=new PublicAnswerFilter();return (filter.push(text)+filter.finish()).trim();}
