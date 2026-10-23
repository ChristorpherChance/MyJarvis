import {Icon} from '../../icons';
import {answerLinks} from './answer-links';
export default function AnswerLinks({text}:{text:string}){const links=answerLinks(text);return links.length?<details className="room-answer-links"><summary>相关链接 · {links.length}</summary>{links.map(link=><p key={link.url}><a href={link.url} target="_blank" rel="noopener noreferrer">{link.title} <Icon name="external" size={14}/></a></p>)}</details>:null;}
