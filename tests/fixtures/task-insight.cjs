const USER="00000000-0000-4000-8000-000000000001",TASK="00000000-0000-4000-8000-000000000010",SUB="00000000-0000-4000-8000-000000000020";
const context=(extra={})=>({type:"tasks",action:"focus",taskId:null,...extra});
function report(selected=false){return{
  schema:"tasks-insights-v1",owner_id:USER,timezone:"Asia/Kuala_Lumpur",as_of:"2026-11-07",data_version:"a".repeat(32),scope:{task_id:selected?TASK:null},
  summary:{total:1,completed:0,incomplete:1,high_priority:1,reminders_today:1,past_reminders:0,subtasks_total:2,subtasks_completed:1},
  tasks:[{id:TASK,version:"b".repeat(32),title:"Prepare project presentation",description:"Present the project progress and a short demo.",priority:"High",is_completed:false,
    created_at:"2026-11-01T02:00:00+00:00",reminder_date:"2026-11-07",reminder_time:"09:00:00",repeat_option:null,
    subtasks_total:2,subtasks_completed:1,omitted_subtasks:0,text_truncated:false,
    subtasks:[{id:SUB,title:"Collect project requirements",is_completed:true},{id:"00000000-0000-4000-8000-000000000021",title:"Prepare the slides",is_completed:false}]}],
};}
module.exports={USER,TASK,SUB,context,report};
