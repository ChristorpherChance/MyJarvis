import Chat from './chat';
import Family from './family';
import Memory from './memory';
import Personas from './personas';
import type {FamilyProps} from './shared';
import {useDemo} from '../../demo/context';
import ConversationHub from './ConversationHub';
import './family.css';
export function FamilyPage(props:FamilyProps&{initialPrompt?:string}){const context=useDemo();const [route,scene]=props.route.split('/');if(context.mode==='live'&&route==='chat')return <ConversationHub theme={String(context.data.theme||'stark')} profile={String(context.data.profile||'me')} navigate={props.navigate} initialPrompt={props.initialPrompt||context.piPrompt} initialMode={scene} onConfigurationChange={context.refresh}/>;switch(route){case 'chat':return <Chat {...props} initialMode={scene}/>;case 'family':return <Family {...props}/>;case 'memory':return <Memory {...props}/>;case 'personas':return <Personas {...props}/>;default:return null}}
export {PiChat} from './PiChat';
export {PiModelSettings} from './PiModelSettings';
export default FamilyPage;
