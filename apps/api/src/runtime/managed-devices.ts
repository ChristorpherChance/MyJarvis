type Device=Record<string,any>;

/** Match the current physical host by a unique real interface, never by CPU/name. */
export function canonicalLocalMachine(machines:Device[],addresses:string[]):Device|undefined{
 const real=new Set(addresses.filter(a=>a!=='::1'&&!a.startsWith('127.')&&a!=='0.0.0.0'&&a!=='::'));
 const candidates=machines.filter(m=>m.kind==='machine'&&m.scope!=='company'&&!m.readOnly&&real.has(m.address));
 return candidates.length===1?candidates[0]:undefined;
}
export function unifiedDevices(legacy:Device[],machines:Device[],at=Date.now()):Device[]{
 const ids=new Set(machines.map(m=>m.id));
 const visible=legacy.filter(d=>!d.canonicalMachineId||!ids.has(d.canonicalMachineId));
 return [...visible,...machines.map(m=>({...m,status:m.agentStatus==='connected'&&Number.isFinite(Date.parse(m.lastSeen))&&at-Date.parse(m.lastSeen)>=-10000&&at-Date.parse(m.lastSeen)<60000?'online':'unknown'}))];
}
