//整理用户消息逻辑
export const CHAT_MESSAGE_LIMIT = 2000;
export function buildChatMessages(turns, input) {
  const content=input.trim();
  if(!content || Array.from(content).length>CHAT_MESSAGE_LIMIT) throw Object.assign(new Error("AI_INPUT_INVALID"),{code:"AI_INPUT_INVALID"});
  let remaining=6000-Array.from(content).length;
  const pairs=[];
  for(const turn of turns.filter(item=>item.status==="completed").slice(-6).reverse()) {
    const user=Array.from(turn.question).slice(0,2000).join(""),assistant=Array.from(turn.answer).slice(0,2000).join("");
    const length=Array.from(user).length+Array.from(assistant).length;
    if(length>remaining) break;
    pairs.unshift({role:"user",content:user},{role:"assistant",content:assistant});remaining-=length;
  }
  return [...pairs,{role:"user",content}];
}
const known = ["AI_INPUT_INVALID","AI_AUTH_REQUIRED","AI_AUTH_UNAVAILABLE","AI_SERVER_CONFIG","AI_SETUP_REQUIRED","AI_DEPLOY_REQUIRED","AI_USER_DAILY_LIMIT","AI_GLOBAL_DAILY_LIMIT","AI_RATE_LIMIT","AI_BUSY","AI_IN_PROGRESS","AI_RETRY_NEW_REQUEST","AI_REQUEST_CONFLICT","AI_DISABLED","AI_PROVIDER_AUTH","AI_PROVIDER_LIMIT","AI_PROVIDER_UNAVAILABLE","AI_EMPTY_RESPONSE","AI_TIMEOUT","AI_DATABASE_ERROR","AI_INVALID_RESPONSE","AI_ORIGIN_DENIED","AI_ABORTED","AI_NETWORK","AI_RESULT_PENDING"];
export const chatErrorKey=error=>`askPlanwise.errors.${[...known,"AI_RETRIEVAL_SETUP_REQUIRED","AI_RETRIEVAL_LOAD_FAILED","AI_RETRIEVAL_DATA_INVALID","AI_EXPENSE_DATE_AMBIGUOUS","AI_EXPENSE_SCOPE_MISMATCH","AI_EXPENSE_RANGE_SETUP_REQUIRED","AI_EXPENSE_RANGE_LIMIT","AI_NOTES_CHANGED","AI_SCOPE_INVALID","AI_WORKSPACE_DATA_INVALID","AI_WORKSPACE_LOAD_FAILED","AI_WORKSPACE_SETUP_REQUIRED","AI_WORKSPACE_CHANGED","AI_TASK_INPUT_INVALID","AI_TASK_DATA_INVALID","AI_TASK_LOAD_FAILED","AI_TASK_SETUP_REQUIRED","AI_TASK_UNAVAILABLE","AI_TASK_TOO_LONG","AI_TASK_CHANGED","AI_MODEL_UNAVAILABLE","AI_NOTE_UNAVAILABLE","AI_NOTE_CHANGED","AI_NOTE_EMPTY","AI_NOTE_TOO_LONG","AI_NOTE_CONTENT_INVALID","AI_NOTE_LOAD_FAILED","AI_NOTE_SAVE_REQUIRED","AI_NOTE_SETUP_REQUIRED","AI_EXPENSE_INPUT_INVALID","AI_EXPENSE_DATA_INVALID","AI_EXPENSE_LOAD_FAILED","AI_EXPENSE_SETUP_REQUIRED","AI_EXPENSE_CHANGED"].includes(error?.code)?error.code:"AI_NETWORK"}`;
