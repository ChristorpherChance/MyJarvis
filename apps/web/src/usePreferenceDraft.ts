import {useEffect,useRef,useState} from 'react';
import {preferenceDraft,receivePreferences,type PreferenceDraft} from './personal-settings-draft';

export function usePreferenceDraft<T>(identity:string,revision:number,values:T) {
 const [stored,setStored]=useState(()=>preferenceDraft(identity,revision,values));
 const current=useRef(stored);
 const state=stored.identity===identity?stored:preferenceDraft(identity,revision,values);
 current.current=state;
 const setState=(update:PreferenceDraft<T>|((old:PreferenceDraft<T>)=>PreferenceDraft<T>))=>{
  const next=typeof update==='function'?update(current.current):update;
  current.current=next;setStored(next);
 };
 useEffect(()=>{setState(old=>receivePreferences(old,identity,revision,values))},[identity,revision,values]);
 return {state,setState,current};
}
