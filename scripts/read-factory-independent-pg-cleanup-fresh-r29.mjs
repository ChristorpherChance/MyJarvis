/** Same frozen observer; retain each real protection read on fresh qualification. */
import {open} from 'node:fs/promises';import {createHash,randomUUID} from 'node:crypto';
import {verifyFactoryIndependentPGCleanupR29,independentPGCleanupFailure} from './verify-factory-independent-pg-cleanup-r29.mjs';
import {verifyFactoryProtectionContractR29R2} from './verify-factory-protection-contract-r29-r2.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex');
const refs=[];
async function store(prefix,value){const path='artifacts/software-factory/goals-r29/'+prefix+'-'+Date.now()+'-'+randomUUID()+'.json',raw=JSON.stringify(value,null,2)+'\n',f=await open(path,'wx',0o644);try{await f.writeFile(raw);await f.sync()}finally{await f.close()}return {path,sha256:hash(raw)}}
let value;
try{value=await verifyFactoryIndependentPGCleanupR29({attempt:'3c7ade1178fc47184cd9aaba9e84b855'},{verifyProtection:async()=>{const r=await verifyFactoryProtectionContractR29R2();refs.push(await store('pg-freeze-actual-protection',r));return r;}})}catch(e){value=independentPGCleanupFailure(e)}
value.actualProtectionReadRefs=refs;const receipt=await store('independent-pg-cleanup-fresh',value);console.log(JSON.stringify({...receipt,ready:value.ready,errorCode:value.errorCode,actualProtectionReadRefs:refs}));if(!value.ready)process.exitCode=1;
