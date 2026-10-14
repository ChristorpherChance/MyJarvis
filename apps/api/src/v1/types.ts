export type Scope = 'personal' | 'private' | 'family' | 'company';
export type Domain = 'inbox' | 'research' | 'projects' | 'tasks' | 'experiences' | 'releases' | 'capture-policies'
 | 'sources' | 'books' | 'stories' | 'learning' | 'voice' | 'family' | 'memory' | 'personas'
 | 'machines' | 'services' | 'operations' | 'approvals' | 'settings' | 'jobs';
export interface BusinessRecord { id:string; revision:number; scope:Scope; ownerId:string; [key:string]:any }
export interface CommandEnvelope { commandId:string; expectedVersion:number; scope:Scope; payload:Record<string,any> }
export interface DomainEvent { id:string; sequence:number; at:string; actorId:string; domain:string; objectId:string; type:string; payload:Record<string,unknown> }
export class BusinessError extends Error {
  constructor(public code:string,message:string,public status=400,public details:Record<string,unknown>={}){super(message);this.name='BusinessError'}
}
/** A synchronous unit of work. The route opens one transaction around command + events + receipt. */
export interface CommandContext {
 actorId:string; scope:Scope; expectedVersion:number; now:string;
 list(domain:Domain):BusinessRecord[];
 get(domain:Domain,id:string):BusinessRecord|undefined;
 require(domain:Domain,id:string,write?:boolean):BusinessRecord;
 create(domain:Domain,body:Record<string,any>,id?:string):BusinessRecord;
 update(domain:Domain,id:string,patch:Record<string,any>):BusinessRecord;
 check(record:BusinessRecord):void;
 emit(domain:Domain,objectId:string,type:string,payload?:Record<string,unknown>):void;
 machine(id:string):Record<string,any>|undefined;
 executorReady(agent:string,machineId:string):boolean;
 emergencyStopped():boolean;
 member?(profileId:string):Record<string,any>|undefined;
 /** Replace prior receipts for a forgotten object; called inside the same transaction. */
 redactReceipts(domain:Domain,id:string,replacement:BusinessRecord):void;
}
export interface DomainHandler {
 domain:Domain;
 commands:readonly string[];
 execute(command:string,payload:Record<string,any>,context:CommandContext):BusinessRecord;
}
