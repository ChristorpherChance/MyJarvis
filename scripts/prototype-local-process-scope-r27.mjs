/** Only processes descended from this runner's marked Node child are eligible. */
import {spawn} from 'node:child_process';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {writeFileSync} from 'node:fs';
const literal=v=>"'"+String(v).replaceAll("'","''")+"'";
async function ps(code){return new Promise((res,rej)=>{const child=spawn('powershell.exe',['-NoProfile','-NonInteractive','-Command','& ([ScriptBlock]::Create([Console]::In.ReadToEnd()))'],{windowsHide:true,stdio:['pipe','pipe','pipe']});let out='',err='';const timer=setTimeout(()=>{child.kill();rej(Error('OWNED_PROCESS_INSPECTION_TIMEOUT'));},8000);child.stdout.on('data',b=>out+=b);child.stderr.on('data',b=>err+=b);child.once('error',error=>{clearTimeout(timer);rej(error);});child.stdin.end(code);child.once('exit',status=>{clearTimeout(timer);if(status!==0){writeFileSync('.jarvis-dev/maintenance/r27-owned-process-observer-error.txt',err);rej(Error('OWNED_PROCESS_INSPECTION_FAILED'));}else try{res(JSON.parse(out.trim()||'null'));}catch{rej(Error('OWNED_PROCESS_INSPECTION_JSON_INVALID'));}});});}
const common=String.raw`$ErrorActionPreference='Stop'
function Fingerprint($line){$bytes=[Text.Encoding]::UTF8.GetBytes([string]$line);$h=[Security.Cryptography.SHA256]::Create();try{return ([BitConverter]::ToString($h.ComputeHash($bytes))).Replace('-','').ToLowerInvariant()}finally{$h.Dispose()}}
function Row($p){$profile='';if([string]$p.CommandLine -match '--user-data-dir=(?:"([^\"]+)"|([^\s]+))'){$profile=if($Matches[1]){$Matches[1]}else{$Matches[2]};$profile=[IO.Path]::GetFullPath($profile);$tmp=[IO.Path]::GetFullPath([IO.Path]::GetTempPath());if(!$profile.StartsWith($tmp,[StringComparison]::OrdinalIgnoreCase) -or [IO.Path]::GetFileName($profile) -notlike 'playwright_chromiumdev_profile-*'){throw ('OWNED_BROWSER_PROFILE_OUTSIDE_SCOPE: '+$profile+' :: '+$tmp)}};return [pscustomobject]@{pid=[int]$p.ProcessId;parent=[int]$p.ParentProcessId;created=$p.CreationDate.ToUniversalTime().ToString('o');executable=[string]$p.ExecutablePath;commandSHA256=(Fingerprint $p.CommandLine);profile=$profile}}
function Same($p,$r){if(!$p){return $false};return [int]$p.ProcessId -eq [int]$r.pid -and [int]$p.ParentProcessId -eq [int]$r.parent -and $p.CreationDate.ToUniversalTime().ToString('o') -eq [string]$r.created -and [string]$p.ExecutablePath -eq [string]$r.executable -and (Fingerprint $p.CommandLine) -eq [string]$r.commandSHA256}
`;
export async function createOwnedProcessScope(child,{nonce,testPath}){
 if(process.platform!=='win32')throw Error('LOCAL_OBSERVER_WINDOWS_ONLY');
 const known=new Map(),rootPID=child.pid,nodePath=resolve(process.execPath),chromePath='C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';let inspecting=null;
 async function capture(){if(inspecting)return inspecting;inspecting=ps(common+`
$all=@(Get-CimInstance Win32_Process);$by=@{};foreach($p in $all){$by[[int]$p.ProcessId]=$p};$selected=@{};$known=ConvertFrom-Json ${literal(JSON.stringify([...known.values()]))};foreach($r in $known){$p=$by[[int]$r.pid];if(Same $p $r){$selected[[int]$r.pid]=$p}}
$root=$by[${rootPID}];if($root -and ([string]$root.CommandLine).Contains(${literal('--jarvis-local-r27-scope='+nonce)}) -and ([string]$root.CommandLine).Contains(${literal(testPath)}) -and [string]$root.ExecutablePath -eq ${literal(nodePath)}){$selected[${rootPID}]=$root}
$changed=$true;while($changed){$changed=$false;foreach($p in $all){$id=[int]$p.ProcessId;$parent=$selected[[int]$p.ParentProcessId];if(!$selected.ContainsKey($id) -and $parent -and $p.CreationDate -ge $parent.CreationDate -and ([string]$p.ExecutablePath -eq ${literal(nodePath)} -or [string]$p.ExecutablePath -eq ${literal(chromePath)})){$selected[$id]=$p;$changed=$true}}}
ConvertTo-Json -InputObject @($selected.Values|ForEach-Object{Row $_}) -Depth 4 -Compress
`).then(rows=>{for(const row of Array.isArray(rows)?rows:rows?[rows]:[])known.set(row.pid,row);return [...known.values()];}).finally(()=>inspecting=null);return inspecting;}
 await capture();
 return {capture,async settle({force=false}={}){
  await capture();const records=[...known.values()];
  const verdict=await ps(common+`
$records=ConvertFrom-Json ${literal(JSON.stringify(records))};$killed=@();$mismatches=@();if(${force?'$true':'$false'}){$before=@(Get-CimInstance Win32_Process);$beforeBy=@{};foreach($p in $before){$beforeBy[[int]$p.ProcessId]=$p};$alive=@($records|Where-Object{Same $beforeBy[[int]$_.pid] $_});foreach($r in ($alive|Sort-Object pid -Descending)){$p=Get-CimInstance Win32_Process -Filter ('ProcessId='+[int]$r.pid);if(!$p){continue};if(Same $p $r){Stop-Process -Id ([int]$r.pid) -Force -ErrorAction SilentlyContinue;$killed+=[int]$r.pid}else{$mismatches+=[int]$r.pid}}}
Start-Sleep -Milliseconds 200;$after=@(Get-CimInstance Win32_Process);$afterBy=@{};foreach($p in $after){$afterBy[[int]$p.ProcessId]=$p};$live=@();foreach($r in $records){$p=$afterBy[[int]$r.pid];if(Same $p $r){$live+=[int]$r.pid}};$profiles=@($records|Where-Object profile|Select-Object -ExpandProperty profile -Unique);$profilesLive=@();foreach($p in @($after|Where-Object Name -eq 'chrome.exe')){foreach($profile in $profiles){$line=[string]$p.CommandLine;$needle='--user-data-dir='+$profile;if($line.Contains($needle+' ') -or $line.EndsWith($needle) -or $line.Contains($needle+'"') -or $line.Contains('--user-data-dir="'+$profile+'"')){$profilesLive+=[int]$p.ProcessId}}}
[pscustomobject]@{killed=$killed;identityMismatches=$mismatches;remainingExactProcesses=$live;remainingExactProfileProcesses=@($profilesLive|Select-Object -Unique);ownedProcessCount=$records.Count;ownedProfileCount=$profiles.Count;clean=($live.Count -eq 0 -and $profilesLive.Count -eq 0)}|ConvertTo-Json -Depth 4 -Compress
`);
  return {...verdict,ownedProcessCount:records.length,rootObserved:known.has(rootPID),scopeNonceSHA256:createHash('sha256').update(nonce).digest('hex'),processIdentities:records.map(r=>({...r,profile:r.profile?'<owned-playwright-profile>/'+r.profile.split(/[\\/]/).at(-1):'',executable:r.executable===nodePath?'Node.js':r.executable===chromePath?'system Chrome':'withheld'})),rawCommandsExported:false};
 }};
}
