import {useEffect,useState} from 'react';
import {api} from '../../api';
import {KV,Note,Panel} from './common';
export type PowerNode={machineId:string;status:string;reason:string;profile?:{dimmCount:number;ssdCount:number;hddCount:number;evidence:string}|null;cpuPackage?:{watts:number;observedAt:string;windowSeconds:number}|null;estimate?:{minimumWatts:number;maximumWatts:number;observedAt:string;method:string;projection30Days:{minimumKWh:number;maximumKWh:number;assumption:string}}|null};
type Snapshot={nodes:PowerNode[];at:string;estimatedNodes:number;localNodes:number;excludedNodes:number;total:{minimumWatts:number;maximumWatts:number;projection30Days:{minimumKWh:number;maximumKWh:number}}|null;note:string};
export function usePowerSummary(){const [snapshot,setSnapshot]=useState<Snapshot|null>(null),[error,setError]=useState('');useEffect(()=>{let alive=true;const load=async()=>{try{const value=await api<Snapshot>('/runtime/power');if(alive){setSnapshot(value);setError('');}}catch(e){if(alive){setSnapshot(null);setError('功耗估算暂不可用');}}};void load();const timer=setInterval(()=>void load(),15000);return()=>{alive=false;clearInterval(timer);};},[]);return {snapshot,error};}
export function PowerSummaryBar({snapshot,error}:{snapshot:Snapshot|null;error:string}){return <details className="power-summary"><summary>本地功耗估算 · {snapshot?.total?`${snapshot.total.minimumWatts}–${snapshot.total.maximumWatts} W`:error||'等待完整采样'}<small>{snapshot?` ${snapshot.estimatedNodes}/${snapshot.localNodes} 台 · ${snapshot.excludedNodes} 台已排除`:''}</small></summary><div><p>整机功耗为粗估范围，CPU 功率来自芯片能耗计数器。云服务器不计入。</p>{snapshot?.total&&<p>按当前负载每天 24 小时运行 30 天：约 {snapshot.total.projection30Days.minimumKWh}–{snapshot.total.projection30Days.maximumKWh} 度。此值为推演，实际电量需插座电表；电费 = 度数 × 你的电价。</p>}<p>不包含显示器、交换机或外接设备。采样缺失时不按零计算。</p></div></details>;}
export function MachinePowerLine({node}:{node?:PowerNode}){return <div className="server-power"><small>整机估算</small><strong>{node?.estimate?`${node.estimate.minimumWatts}–${node.estimate.maximumWatts} W`:node?.status==='excluded'?'不计入':node?.status==='unknown'?'采样过期':'待采样'}</strong>{node?.cpuPackage&&<small>CPU {node.cpuPackage.watts.toFixed(1)} W</small>}</div>;}
export function MachinePowerDetail({node}:{node?:PowerNode}){return <Panel title="功耗与用电"><KV items={[
 ['整机功耗',node?.estimate?`${node.estimate.minimumWatts}–${node.estimate.maximumWatts} W · 估算`:node?.reason??'等待采样'],
 ['CPU 功率',node?.cpuPackage?`${node.cpuPackage.watts.toFixed(2)} W · RAPL / ${node.cpuPackage.windowSeconds.toFixed(1)}秒均值`:'未采到芯片能耗，暂以CPU负载估算'],
 ['估算依据',node?.estimate?(node.estimate.method==='rapl-plus-components'?'CPU能耗 + 内存/磁盘/主板/电源损耗':'CPU负载 + 硬件清单'):'—'],
 ['30 天推演',node?.estimate?`${node.estimate.projection30Days.minimumKWh}–${node.estimate.projection30Days.maximumKWh} 度`:'—'],
 ['硬件清单',node?.profile?`${node.profile.dimmCount} 条内存 · ${node.profile.ssdCount} SSD · ${node.profile.hddCount} HDD`:'尚未配置'],
 ['采样时间',node?.cpuPackage?.observedAt??node?.estimate?.observedAt??'—']
 ]}/><Note>{node?.status==='excluded'?'云服务器与非本地设备已排除。':'当前为粗估，CPU功率不代表整机插座功率。电量假设持续当前负载、每天24小时；校准请接插座电表。'}</Note>{node?.profile&&<small>{node.profile.evidence}</small>}</Panel>;}
