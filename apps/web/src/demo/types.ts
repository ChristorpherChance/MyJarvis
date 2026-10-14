/** Compatibility DTOs exported from the approved V15 design; never a production database. */
export interface DemoRecord {id:string;[key:string]:any}
export interface DemoData {
 schema:number;profile:string;theme:string;profiles:DemoRecord[];
 machines:DemoRecord[];projects:DemoRecord[];tasks:DemoRecord[];experiences:DemoRecord[];approvals:DemoRecord[];
 audit:DemoRecord[];activity:any[];settings:Record<string,any>;preferences:Record<string,any>;chat:Record<string,any[]>;
 learning:Record<string,any>;familyTodos:DemoRecord[];knowledge:Record<string,any>;v5:Record<string,any>;
 [key:string]:any;
}
export interface DemoAction {type:string;payload?:Record<string,unknown>}
