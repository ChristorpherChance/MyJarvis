import type {ExecutionTemplate} from './execution-types.js';
import {absoluteExecutionPath,executionPath} from './execution-paths.js';

/** A separate exception for the root-owned autonomy wrapper, never a global path-policy relaxation. */
export function isProtectedAutonomyTemplate(template:ExecutionTemplate):boolean {
 if(!template||typeof template!=='object'||Array.isArray(template))return false;
 const validation=template.validation,args=validation?.args;
 if(validation?.program!=='/usr/bin/sudo'||!Array.isArray(args)||args.length!==6||args[0]!=='-n'||args[1]!=='/usr/local/libexec/jarvis-project-autonomy-validation'||args[2]!=='{workspace}'||args[3]!=='{runId}'||typeof args[4]!=='string'||!/^FA-0[1-9]$/.test(args[4])||typeof args[5]!=='string'||!/^[a-f0-9]{64}$/.test(args[5]))return false;
 if(template.engine==='claude'||template.engine==='codex')return template.purpose===undefined;
 return template.engine==='fixed'&&template.purpose==='project-autonomy-validation'&&template.program==='/usr/bin/true'&&Array.isArray(template.args)&&template.args.length===0&&template.maxRounds===1&&template.supervision===undefined;
}

/** Equality only; callers retain their existing strict-child rule for every other workspace. */
export function protectedAutonomyExactWorkspace(template:ExecutionTemplate,workspace:string):boolean {
 const root=template?.workspaceRoot;
 return isProtectedAutonomyTemplate(template)&&typeof root==='string'&&typeof workspace==='string'&&absoluteExecutionPath(root)&&absoluteExecutionPath(workspace)&&executionPath(root)===executionPath(workspace)&&executionPath(root).relative(root,workspace)==='';
}
