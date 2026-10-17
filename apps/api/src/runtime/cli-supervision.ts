import type {ExecutionTemplate,CliSupervisionPolicy,CliBillingCheckpoint,ActualUsage} from './execution-types.js';

export function validateCliSupervision(raw:unknown):CliSupervisionPolicy {
 const p=raw as any;if(!p||typeof p!=='object'||Array.isArray(p)||Object.keys(p).some(k=>!['billing','maxTokens','maxRecoveryAttempts','retryDelaySec','repairValidation','fallbackExecutorIds','inputUSDPerMillion','outputUSDPerMillion'].includes(k)))throw Error('CLI_SUPERVISION_INVALID');
 const integer=(n:unknown,min:number,max:number)=>{if(!Number.isSafeInteger(n)||Number(n)<min||Number(n)>max)throw Error('CLI_SUPERVISION_LIMIT_INVALID');return Number(n)};
 if(!['priced','subscription','record-only'].includes(p.billing)||typeof p.repairValidation!=='boolean')throw Error('CLI_SUPERVISION_POLICY_INVALID');
 if(!Array.isArray(p.fallbackExecutorIds)||p.fallbackExecutorIds.length>8||p.fallbackExecutorIds.some((x:unknown)=>typeof x!=='string'||!x.trim()||x.length>200)||new Set(p.fallbackExecutorIds).size!==p.fallbackExecutorIds.length)throw Error('CLI_FALLBACK_INVALID');
 const rates:any={};for(const k of ['inputUSDPerMillion','outputUSDPerMillion'])if(p[k]!==undefined){if(typeof p[k]!=='number'||!Number.isFinite(p[k])||p[k]<0||p[k]>1000)throw Error('CLI_PRICE_INVALID');rates[k]=p[k]}
 if((rates.inputUSDPerMillion===undefined)!==(rates.outputUSDPerMillion===undefined))throw Error('CLI_BOTH_PRICES_REQUIRED');
 return {billing:p.billing,maxTokens:integer(p.maxTokens,1000,10000000),maxRecoveryAttempts:integer(p.maxRecoveryAttempts,0,8),retryDelaySec:integer(p.retryDelaySec,60,86400),repairValidation:p.repairValidation,fallbackExecutorIds:[...p.fallbackExecutorIds],...rates};
}

/** Resume the exact project session; never select another session with --last/--continue. */
export function cliSessionArguments(template:ExecutionTemplate,input:string[],sessionId?:string):string[]{
 if(!['codex','claude'].includes(template.engine))return input;
 if(sessionId&&!/^[A-Za-z0-9][A-Za-z0-9_-]{0,199}$/.test(sessionId))throw Error('CLI_SESSION_ID_INVALID');
 const args=[...input];
 if(template.engine==='claude'){
  const resume=args.indexOf('--resume');if(resume>=0){args.splice(resume,2)}
  if(!args.includes('--verbose'))args.push('--verbose');
  if(sessionId)args.push('--resume',sessionId);return args;
 }
 const exec=args.indexOf('exec');if(exec<0)throw Error('CLI_EXEC_REQUIRED');
 if(!sessionId)return args;
 // These are global CLI options, not options of the exec resume subcommand.
 const globals:string[]=[];
 for(let i=exec+1;i<args.length;i++)if(['--sandbox','--cd','-C'].includes(args[i])){globals.push(...args.splice(i,2));i--}else if(args[i].startsWith('--cd=')||args[i].startsWith('-C')&&args[i]!=='-C'){globals.push(...args.splice(i,1));i--}
 const at=args.indexOf('exec');args.splice(at,0,...globals);args.splice(args.indexOf('exec')+1,0,'resume',sessionId);return args;
}

export type CliFailure={kind:'quota'|'network'|'authentication'|'permission'|'unknown';message:string};
export function classifyCliFailure(message:string,code?:string):CliFailure {
 const text=(code??'')+' '+message;
 const kind=/quota|usage.limit|rate.limit|too.many.requests|429|额度|用量.*(?:满|限)/i.test(text)?'quota':/unauthorized|authentication|invalid.api.key|login.required|401|未登录|认证失败/i.test(text)?'authentication':/permission.denied|approval.required|not.allowed|403|权限|授权/i.test(text)?'permission':/ECONNRESET|ETIMEDOUT|ENOTFOUND|connection.*(?:closed|failed)|network.error|502|503|504/i.test(text)?'network':'unknown';
 return {kind,message:message.slice(0,20000)||'执行器未能完成当前轮次'};
}

/** Claude reports whole-session spend on resume. Subtract only a matching native checkpoint. */
export function roundCliUsage(engine:ExecutionTemplate['engine'],usage:ActualUsage|undefined,sessionId:string|undefined,totalCost:number|undefined,prior:CliBillingCheckpoint|undefined,policy?:CliSupervisionPolicy,resumedSessionId?:string,nativeCliVersion?:string):{usage?:ActualUsage;checkpoint?:CliBillingCheckpoint}{
 if(!usage)return {};
 let value={...usage};let checkpoint:CliBillingCheckpoint|undefined;
 if(engine==='claude'&&sessionId&&totalCost!==undefined&&Number.isFinite(totalCost)&&totalCost>=0){
  const baseline=prior?.engine==='claude'&&prior.sessionId===sessionId?prior.costUSD:undefined;
  checkpoint={engine:'claude',sessionId,costUSD:Math.max(totalCost,baseline??0),...(nativeCliVersion?{nativeCliVersion}:{}),costScope:'session-cumulative'};
  // A resumed session without a cost baseline cannot be priced safely.
  if(baseline===undefined&&resumedSessionId===sessionId||baseline!==undefined&&totalCost<baseline){delete value.costUSD;delete value.costKind;}
  else{value.costUSD=totalCost-(baseline??0);value.costKind='catalog-estimate';}
  // A compatible gateway model outside Claude's catalogue can report a zero estimate
  // despite real usage. It is unpriced evidence, not permission for unlimited priced rounds.
  if(totalCost===0&&(value.totalTokens??((value.inputTokens??0)+(value.outputTokens??0)))>0&&policy?.billing!=='subscription'&&!/^(?:anthropic\/)?claude[-_]/i.test(value.model??'')){delete value.costUSD;delete value.costKind;}
 }else if(engine==='codex'&&policy?.inputUSDPerMillion!==undefined&&policy.outputUSDPerMillion!==undefined&&typeof value.inputTokens==='number'&&typeof value.outputTokens==='number'){value.costUSD=(value.inputTokens*policy.inputUSDPerMillion+value.outputTokens*policy.outputUSDPerMillion)/1000000;value.costKind='catalog-estimate';}
 if(engine==='claude'&&value.costUSD===undefined&&policy&&['priced','record-only'].includes(policy.billing)&&value.usageComplete===true){
  const inputRate=policy.inputUSDPerMillion,outputRate=policy.outputUSDPerMillion;
  const count=(n:unknown)=>Number.isSafeInteger(n)&&Number(n)>=0;
  const rate=(n:unknown)=>typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=1000;
  if(rate(inputRate)&&rate(outputRate)&&count(value.inputTokens)&&count(value.outputTokens)&&(value.totalTokens===undefined||value.totalTokens===value.inputTokens!+value.outputTokens!)){
   // Explicit owner prices are an estimate, never an invoice or a replacement
   // for a reliable native session delta. Normalized Claude input already includes caches.
   value.costUSD=(value.inputTokens!*inputRate!+value.outputTokens!*outputRate!)/1000000;value.costKind='catalog-estimate';
  }
 }
 if(engine==='claude'&&resumedSessionId){const match=/^(\d+)\.(\d+)\.(\d+)$/.exec(nativeCliVersion??'');const cumulative=!!match&&(Number(match[1])>2||Number(match[1])===2&&(Number(match[2])>1||Number(match[2])===1&&Number(match[3])>=277));if(!cumulative||usage.usageComplete!==true){delete value.costUSD;delete value.costKind;value.costComplete=false;checkpoint=undefined;}}
 return {usage:value,...(checkpoint?{checkpoint}:{})};
}
