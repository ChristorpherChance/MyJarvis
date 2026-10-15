/** Only a random epoch is shared across tabs. Member IDs, credentials and questions stay out of storage. */
export const MEMBER_SESSION_KEY='jarvis-member-session-epoch-v1';
export interface MemberSessionEnvironment {read:()=>string|null;write:(epoch:string)=>void;subscribe:(changed:(key:string|null)=>void)=>()=>void;nonce:()=>string}
export function createMemberSessionEpoch(environment:MemberSessionEnvironment){
 let generation=0;const listeners=new Set<()=>void>();
 const shared=()=>{try{return environment.read()||'initial'}catch{return 'unavailable'}};
 let observed=shared();
 const snapshot=()=>generation+':'+shared();
 const notify=()=>{generation++;for(const listener of listeners)listener()};
 const unsubscribe=environment.subscribe(key=>{if(key!==MEMBER_SESSION_KEY&&key!==null)return;const value=shared();if(value===observed)return;observed=value;notify()});
 return {snapshot,current:(value:string)=>value===snapshot(),subscribe:(listener:()=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener)}},advance:()=>{let synchronized=false;try{const epoch=environment.nonce();environment.write(epoch);synchronized=environment.read()===epoch;}catch{}observed=shared();notify();return synchronized;},close:()=>{unsubscribe();listeners.clear()}};
}
const session=createMemberSessionEpoch({read:()=>globalThis.localStorage.getItem(MEMBER_SESSION_KEY),write:epoch=>globalThis.localStorage.setItem(MEMBER_SESSION_KEY,epoch),nonce:()=>crypto.randomUUID(),subscribe:changed=>{if(!globalThis.window)return()=>{};const listener=(event:StorageEvent)=>changed(event.key);window.addEventListener('storage',listener);return()=>window.removeEventListener('storage',listener)}});
export const memberSessionSnapshot=()=>session.snapshot();
export const memberSessionCurrent=(value:string)=>session.current(value);
export const advanceMemberSession=()=>session.advance();
export const subscribeMemberSession=(listener:()=>void)=>session.subscribe(listener);

/** Keep one initiating identity turn through cleanup and both identity mutations. */
export async function runMemberLoginTransition(options:{current:()=>boolean;closing:Promise<unknown>;logout:()=>Promise<unknown>;login:()=>Promise<unknown>}){
 const check=()=>{if(!options.current())throw new DOMException('Aborted','AbortError')};
 check();await options.closing;check();await options.logout();check();await options.login();check();
}
