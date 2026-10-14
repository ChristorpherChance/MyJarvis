import {BusinessError} from '../v1/types.js';
export const executionTimezone='Asia/Shanghai';
export function validateExecutionQuiet(value:unknown):string {
 if(value===undefined||value===null||value==='')return '';
 if(typeof value!=='string'||!/^([01]\d|2[0-3]):[0-5]\d-([01]\d|2[0-3]):[0-5]\d$/.test(value)||value.slice(0,5)===value.slice(6))throw new BusinessError('VALIDATION','安静时段须为 HH:MM-HH:MM，起止不同；时区 Asia/Shanghai',400);
 return value;
}
export function executionQuietActive(quiet:unknown,at=new Date()):boolean {
 const value=validateExecutionQuiet(quiet);if(!value)return false;
 const parts=new Intl.DateTimeFormat('en-GB',{timeZone:executionTimezone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(at),minute=Number(parts.find(p=>p.type==='hour')!.value)*60+Number(parts.find(p=>p.type==='minute')!.value),[start,end]=value.split('-').map(t=>Number(t.slice(0,2))*60+Number(t.slice(3)));
 return start<end?minute>=start&&minute<end:minute>=start||minute<end;
}
