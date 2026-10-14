import {useEffect,useRef} from 'react';
import {v1Request} from '../../v1-client';
/** A late response cannot repopulate private views after logout or unmount. */
export function usePrivateRuntime(reset:()=>void){
 const currentReset=useRef(reset);currentReset.current=reset;
 const state=useRef({mounted:false,epoch:0,requests:new Set<AbortController>()});
 const clear=()=>{state.current.epoch++;for(const request of state.current.requests)request.abort();state.current.requests.clear();currentReset.current();};
 useEffect(()=>{state.current.mounted=true;const expired=()=>clear();window.addEventListener('jarvis:auth-required',expired);return()=>{state.current.mounted=false;state.current.epoch++;for(const request of state.current.requests)request.abort();state.current.requests.clear();window.removeEventListener('jarvis:auth-required',expired);};},[]);
 return async<T=any>(path:string,method='GET',body?:unknown):Promise<T>=>{
  const own=new AbortController(),epoch=state.current.epoch;state.current.requests.add(own);
  try{const value=await v1Request<T>(path,{method,signal:AbortSignal.any([own.signal,AbortSignal.timeout(15000)]),...(body===undefined?{}:{body:JSON.stringify(body)})});if(!state.current.mounted||own.signal.aborted||epoch!==state.current.epoch)throw new DOMException('请求已取消','AbortError');return value;
  }catch(e){if((e as any).status===401||(e as any).status===403){clear();if((e as any).status===401)window.dispatchEvent(new Event('jarvis:auth-required'));}throw e;}finally{state.current.requests.delete(own);}
 };
}
