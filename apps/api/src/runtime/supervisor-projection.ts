import {createHash} from 'node:crypto';
/** UUID-shaped deterministic stage IDs satisfy public schemas without conflating different side effects. */
export function supervisorStageId(eventId:string,stage:string){const h=createHash('sha256').update('r43:'+eventId+':'+stage).digest('hex');return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20,32)}`;}
