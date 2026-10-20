import {Button,Panel,Tag,type Props} from './common';
import {baselineStatus,baselineTaskRoute,type BaselineSnapshot,type BaselineUsage} from './project-baseline-view';
import {Icon} from '../../icons';

const plan='/api/v1/project-autonomy/acceptance-plan';
const money=(value:number|null|undefined)=>typeof value==='number'&&Number.isFinite(value)&&value>=0?`USD ${value.toFixed(4)}`:'未报告';
function Usage({usage}:{usage:BaselineUsage}){return <p className="project-autonomy-caption">已知费用 {money(usage.knownCostUSD)} · Token {typeof usage.tokens==='number'?usage.tokens.toLocaleString('zh-CN'):'未报告'}{usage.unknownCostCount>0&&<> · {usage.unknownCostCount} 笔费用未知，未按零计算</>}</p>;}

export default function ProjectBaselinePanel({snapshot,navigate}:{snapshot:BaselineSnapshot;navigate:Props['navigate']}){
 const {main,latest}=snapshot;
 return <Panel title="现有成果验收" actions={<a className="project-baseline-plan" href={plan} target="_blank" rel="noreferrer">新验收计划 <Icon name="external" size={14}/></a>}>
  <p className="project-autonomy-caption">先检查现有工厂，证实问题后再修。主线和冻结候选分别留证；固定检查结果不计入完整目标独立验收。</p>
  <div className="project-baseline-sources">
   <article className="project-baseline-source"><header><h4>main 现有成果 · 主验</h4>{main&&<Tag tone={baselineStatus(main,false).tone}>{baselineStatus(main,false).label}</Tag>}</header>
    <p>{main?.summary??'尚未读到当前main的实际检查任务。'}</p>
    {main&&<><Usage usage={main.usage}/><Button onClick={()=>navigate(baselineTaskRoute(main.taskId)!)}>查看main任务</Button><details className="project-autonomy-definition"><summary>主线检查详情</summary><dl><dt>源码来源</dt><dd>实际main；以本次任务读取的内容为准</dd><dt>工作目录</dt><dd>{main.workspace}</dd><dt>源码指纹</dt><dd>{main.sourceFingerprint||'尚未取得执行回执中的指纹'}</dd><dt>任务</dt><dd>{main.taskId}</dd><dt>运行</dt><dd>{main.runId}</dd><dt>执行状态</dt><dd>{main.runStatus??'未报告'}</dd><dt>验证退出码</dt><dd>{main.validationExitCode??'未报告'}</dd></dl></details></>}
   </article>
   <article className="project-baseline-source"><header><h4>冻结候选 · 对照</h4>{latest&&<Tag tone={baselineStatus(latest,true).tone}>{baselineStatus(latest,true).label}</Tag>}</header>
    <p>{latest?.summary??'尚未登记候选对照检查。主线实际结果单独保留。'}</p>
    {latest&&<><p className="project-autonomy-caption">范围：本批固定检查；{latest.objectiveIds.length} 项关联目标仍需逐条独立验收。</p><Usage usage={latest.usage}/>{latest.taskId&&<Button onClick={()=>navigate(baselineTaskRoute(latest.taskId)!)}>查看候选任务</Button>}<details className="project-autonomy-definition"><summary>候选范围与真实检查</summary><dl><dt>源码来源</dt><dd>冻结候选对照；不等同当前main</dd><dt>工作包</dt><dd>{latest.workPackage}</dd><dt>批次</dt><dd>{latest.id}</dd><dt>工作目录</dt><dd>{latest.workspace}</dd><dt>源码指纹</dt><dd>{latest.sourceFingerprint}</dd><dt>任务</dt><dd>{latest.taskId??'尚未登记'}</dd><dt>运行</dt><dd>{latest.runId??'尚未运行'}</dd><dt>报告指纹</dt><dd>{latest.reportSha256??'尚未取得'}</dd></dl>{latest.checks.length>0?<ul className="project-baseline-checks">{latest.checks.map((check,index)=><li key={`${check.id}-${index}`}><strong>{check.id}</strong><span>{!check.executed?'未执行':check.status==='pass'?'通过':check.status==='fail'?'未通过':'待核对'}{check.required?' · 必需':''}</span>{check.tests&&<small>用例 {check.tests.total}：通过 {check.tests.passed}，失败 {check.tests.failed}，跳过 {check.tests.skipped}，未知 {check.tests.unknown}</small>}</li>)}</ul>:<p className="project-autonomy-caption">本批检查报告尚未取得。</p>}</details></>}
   </article>
  </div>
  <p className="project-autonomy-caption">下一步按报告区分环境问题与实际缺陷，再做完整测试、隔离运行和全新客户工程检查。无需重新启动旧计划；暂停或结束当前检查请打开对应任务。</p>
 </Panel>;
}
