/** Remove only this verification job's unused public ZIP and incomplete local copy. */
import {readFile,lstat,unlink,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {remote,cloudProfile,python} from './managed-server-client.mjs';
const base='artifacts/software-factory/full-test',receipt=JSON.parse(await readFile(base+'/public-browser-asset.json','utf8'));
if(!/^[a-f0-9]{32}$/.test(receipt.job)||receipt.path!==('/tmp/jarvis-factory-public-browser-'+receipt.job+'/chrome-headless-shell-linux64.zip')||receipt.sha256!=='3cfc2bd00d1bafcf8a68dc74c9c92bb7150ddc8d26ade948a776316e1cec4f14')throw Error('ASSET_CLEANUP_SCOPE_INVALID');
const local=resolve(base,'public-browser-'+receipt.job+'.zip'),info=await lstat(local);
if(!info.isFile()||info.isSymbolicLink())throw Error('LOCAL_ASSET_CLEANUP_INVALID');
const partial=await readFile(local),prefixSHA=createHash('sha256').update(partial).digest('hex');
const cloud=JSON.parse(remote(cloudProfile,'jarvis-jp',python({...receipt,prefixBytes:partial.length,prefixSHA},'from pathlib import Path\nimport hashlib,json\nq=Path(p["path"])\nif q.is_symlink() or q.stat().st_size!=p["bytes"]:raise RuntimeError("PUBLIC_ASSET_CLEANUP_INVALID")\nraw=q.read_bytes()\nif hashlib.sha256(raw).hexdigest()!=p["sha256"] or hashlib.sha256(raw[:p["prefixBytes"]]).hexdigest()!=p["prefixSHA"]:raise RuntimeError("PUBLIC_ASSET_CLEANUP_HASH_MISMATCH")\nq.unlink();q.parent.rmdir()\nprint(json.dumps({"exactPublicAssetRemoved":True,"localPrefixVerified":True}))'),false));
if(cloud.exactPublicAssetRemoved!==true||cloud.localPrefixVerified!==true||createHash('sha256').update(await readFile(local)).digest('hex')!==prefixSHA)throw Error('PUBLIC_ASSET_CLEANUP_NOT_VERIFIED');
await unlink(local);
const report={at:new Date().toISOString(),job:receipt.job,officialDownloadComplete:true,downloadSeconds:receipt.seconds,downloadBytes:receipt.bytes,downloadSHA:receipt.sha256,transferComplete:false,assetSentTo101:false,buildAssetUsed:false,cloudTemporaryAssetRemoved:true,localPartialBytes:partial.length,localTemporaryAssetRemoved:true,failures:[{protocol:'SFTP',configuredTimeoutSeconds:120,complete:false,cause:'not captured'},{protocol:'SCP legacy',configuredTimeoutSeconds:45,complete:false,errorCode:'ETIMEDOUT',signal:'SIGTERM'},{protocol:'verified-prefix SSH resume',configuredTimeoutSeconds:60,complete:false,cause:'PUBLIC_ASSET_RESUME_FAILED; subprocess details not captured'}],credentialsExported:false,cloudServicesChanged:false};
await writeFile(base+'/public-browser-transfer-cleanup.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
