import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { ExecutionAgent } from '../../api/src/runtime/agent-runner.js';
import type { ExecutionNodeConfig } from '../../api/src/runtime/execution-types.js';

const arg=process.argv.indexOf('--config');
if(arg<0||!process.argv[arg+1])throw new Error('请使用 --config 指定本机私有节点配置文件');
const configPath=resolve(process.argv[arg+1]);
const agent=new ExecutionAgent(JSON.parse(await readFile(configPath,'utf8')) as ExecutionNodeConfig);
await agent.pair();await agent.save(configPath);
const captureArg=process.argv.indexOf('--capture-file');if(captureArg>=0){const file=resolve(process.argv[captureArg+1]??'');const item=JSON.parse(await readFile(file,'utf8'));const receipt=await agent.capture(item);process.stdout.write(`采集已入收件：${receipt.id}\n`);process.exit(0)}
const stop=async(signal:string)=>{await agent.stop(signal);process.exit(0)};process.once('SIGINT',()=>void stop('SIGINT'));process.once('SIGTERM',()=>void stop('SIGTERM'));
let collecting=false;const collector=setInterval(()=>{if(collecting||!agent.config.journals?.length&&!agent.config.serviceLogs?.length)return;collecting=true;void(async()=>{const count=await agent.collectJournals()+await agent.collectServiceLogs();if(count)await agent.save(configPath);})().catch(()=>process.stderr.write('指定日志采集未成功；请检查授权、格式与连接。\n')).finally(()=>{collecting=false})},3000);collector.unref();
await agent.start(message=>process.stderr.write(`节点状态：${message}\n`));
