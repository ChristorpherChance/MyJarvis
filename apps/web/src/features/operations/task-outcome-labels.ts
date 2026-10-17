export function taskOutcomeLabels(task:Record<string,any>):{execution:string;acceptance:string}{
 const execution:Record<string,string>={queued:'已排队',running:'正在执行',succeeded:'执行成功',failed:'执行失败',cancelled:'执行已取消',interrupted:'执行已中断'};
 return {execution:execution[task.executionStatus||'']||'暂无受控执行回执',acceptance:task.acceptance?.outcome==='pass'?'独立验收通过':task.acceptance?.outcome==='fail'?'独立验收未通过':'尚未独立验收'};
}
