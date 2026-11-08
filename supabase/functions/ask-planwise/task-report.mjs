const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const HASH=/^[a-f0-9]{32}$/;
const fail=(code,status=400)=>Object.assign(new Error(code),{code,status});
export function validateTaskContext(value) {
  if(!value||value.type!=="tasks"||Object.keys(value).some(key=>!["type","action","taskId"].includes(key))
    || !["focus","breakdown"].includes(value.action)
    || (value.action==="focus"?value.taskId!==null:typeof value.taskId!=="string"||!UUID.test(value.taskId)))throw fail("AI_TASK_INPUT_INVALID");
  return{type:"tasks",action:value.action,taskId:value.taskId};
}
export const taskContextKey=context=>JSON.stringify(validateTaskContext(context));
const count=value=>Number.isSafeInteger(value)&&value>=0;
const text=(value,max)=>typeof value==="string"&&Array.from(value).length<=max&&!value.includes("\0");
const day=value=>typeof value==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;
export function validateTaskReport(value,context,userId) {
  const invalid=()=>{throw fail("AI_TASK_DATA_INVALID",502);};
  if(!value||value.schema!=="tasks-insights-v1"||value.timezone!=="Asia/Kuala_Lumpur"||!day(value.as_of)||!HASH.test(value.data_version||"")
    ||(userId&&value.owner_id!==userId)||value.scope?.task_id!==context.taskId)invalid();
  const summary=value.summary;
  if(!summary||!["total","completed","incomplete","high_priority","reminders_today","past_reminders","subtasks_total","subtasks_completed"].every(key=>count(summary[key]))
    ||summary.total!==summary.completed+summary.incomplete||summary.high_priority>summary.incomplete
    ||summary.reminders_today+summary.past_reminders>summary.incomplete||summary.subtasks_completed>summary.subtasks_total)invalid();
  if(!Array.isArray(value.tasks)||value.tasks.length!==(context.taskId?(summary.total===1?1:0):Math.min(summary.incomplete,3))
    ||(context.taskId&&summary.total>1)||new Set(value.tasks.map(row=>row?.id)).size!==value.tasks.length)invalid();
  const ids=new Set();
  for(const row of value.tasks){
    if(!row||!UUID.test(row.id||"")||!HASH.test(row.version||"")||!text(row.title,300)||!text(row.description,context.taskId?8000:1500)
      || !["High","Medium","Low"].includes(row.priority)||typeof row.is_completed!=="boolean"||(!context.taskId&&row.is_completed)
      ||(context.taskId&&row.id!==context.taskId)||!Number.isFinite(Date.parse(row.created_at))
      ||(row.reminder_date!==null&&!day(row.reminder_date))||(row.reminder_time!==null&&!/^([01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,6})?$/.test(row.reminder_time))
      ||(row.repeat_option!==null&&!text(row.repeat_option,100))||typeof row.text_truncated!=="boolean"
      ||!count(row.subtasks_total)||!count(row.subtasks_completed)||row.subtasks_completed>row.subtasks_total||!count(row.omitted_subtasks)
      ||!Array.isArray(row.subtasks)||row.subtasks.length> (context.taskId?50:10)||row.subtasks.length+row.omitted_subtasks!==row.subtasks_total)invalid();
    for(const sub of row.subtasks){if(!sub||!UUID.test(sub.id||"")||ids.has(sub.id)||!text(sub.title,300)||typeof sub.is_completed!=="boolean")invalid();ids.add(sub.id);}
    const done=row.subtasks.filter(sub=>sub.is_completed).length;
    if(done>row.subtasks_completed||row.subtasks_completed-done>row.omitted_subtasks)invalid();
  }
  if(context.taskId&&!value.tasks.length)throw fail("AI_TASK_UNAVAILABLE",404);
  if(context.taskId&&(value.tasks[0].text_truncated||value.tasks[0].omitted_subtasks))throw fail("AI_TASK_TOO_LONG",413);
  return{schema:value.schema,timezone:value.timezone,as_of:value.as_of,data_version:value.data_version,
    scope:{task_id:context.taskId},summary:{...summary},tasks:value.tasks.map(row=>({...row,subtasks:row.subtasks.map(sub=>({...sub}))}))};
}
export const taskSources=report=>report.tasks.map(row=>({type:"task",id:row.id,title:row.title,version:row.version}));
