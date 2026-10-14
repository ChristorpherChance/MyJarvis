import {useEffect,useState} from 'react';
import {Button} from '../../ui';
import PiChat,{type PiChatProps} from './PiChat';
import RoomVoice from './RoomVoice';

/** Both modes are embedded; switching unmounts and cancels the previous transport. */
export default function ConversationHub(props:PiChatProps){
 const [mode,setMode]=useState<'voice'|'text'>(()=>props.initialPrompt||props.initialMode?'text':'voice');
 const [immersive,setImmersive]=useState(false);
 useEffect(()=>{if(props.initialPrompt||props.initialMode){setMode('text');setImmersive(false);}},[props.initialPrompt,props.initialMode]);
 return <div className="conversation-hub"><div className="conversation-hub-tabs" aria-label="对话方式"><Button kind="ghost" className={mode==='voice'?'selected':''} onClick={()=>setMode('voice')}>语音交流</Button><Button kind="ghost" className={mode==='text'?'selected':''} onClick={()=>{setImmersive(false);setMode('text');}}>文字交流</Button><span>一个管家，两种交流方式</span></div>{mode==='voice'?<RoomVoice embedded theme={props.theme} immersive={immersive} onImmersiveChange={()=>setImmersive(v=>!v)}/>:<PiChat {...props}/>}</div>;
}
