import {posix,win32} from 'node:path';

/** Central Linux API also supervises Windows workspaces; never resolve a remote path as a local one. */
export const executionPath=(path:string)=>/^[A-Za-z]:[\\/]|^\\\\/.test(path)?win32:posix;
export const absoluteExecutionPath=(path:string)=>posix.isAbsolute(path)||win32.isAbsolute(path);
export const normalizeExecutionPath=(path:string)=>executionPath(path).normalize(path);
export function executionPathWithin(root:string,target:string){
 if(!absoluteExecutionPath(root)||!absoluteExecutionPath(target)||executionPath(root)!==executionPath(target))return false;
 const paths=executionPath(root),rel=paths.relative(root,target);
 return !!rel&&rel!=='..'&&!rel.startsWith('..'+paths.sep)&&!paths.isAbsolute(rel);
}
