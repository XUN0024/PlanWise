import { createClient } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import { attachmentError, validateAttachmentBatch } from "../lib/attachmentModel";
import { assertAttachmentActive, requireAttachmentSession, uploadAttachmentBytes, uploadTransport } from "./attachmentService";

export const EXPENSE_RECEIPT_BUCKET = "expense-receipts";
const check = (record, expenseId, userId, id = record?.id) => {
  if (!record || !expenseId || record.expense_id !== expenseId || record.user_id !== userId || record.id !== id
    || record.storage_path !== `${userId}/${expenseId}/${id}/${record.object_name || "file"}`) throw attachmentError("ATTACHMENT_AUTH");
  return record;
};
const explain = (error) => {
  if (["42P01","42703","PGRST202","PGRST204","PGRST205","42883"].includes(error?.code)) throw attachmentError("EXPENSE_RECEIPTS_SETUP_REQUIRED");
  throw error;
};
export async function getExpenseReceipts(expenseId,userId) {
  await requireAttachmentSession(userId);
  const {data,error} = await supabase.from("expense_attachments").select("*").eq("expense_id",expenseId).eq("user_id",userId)
    .order("created_at",{ascending:true}).order("id",{ascending:true});
  if(error) explain(error);
  return (data || []).map(record=>check(record,expenseId,userId));
}
async function reserve(file,expenseId,userId,id) {
  const read = () => supabase.from("expense_attachments").select("*").eq("id",id).eq("expense_id",expenseId).eq("user_id",userId).maybeSingle();
  const existing = await read();if(existing.error) explain(existing.error);
  if(existing.data) {
    const record = check(existing.data,expenseId,userId,id);
    if(record.original_name !== file.name || Number(record.size_bytes) !== file.size) throw attachmentError("ATTACHMENT_CONFLICT");
    return {record,existing:true};
  }
  const result = await supabase.from("expense_attachments").insert({id,expense_id:expenseId,user_id:userId,original_name:file.name,
    object_name:"file",size_bytes:file.size,mime_type:file.type || "application/octet-stream"}).select().single();
  if(result.error?.code === "23505") {
    const retry = await read();if(retry.error) explain(retry.error);
    if(retry.data && retry.data.original_name===file.name && Number(retry.data.size_bytes)===file.size) return {record:check(retry.data,expenseId,userId,id),existing:true};
    throw attachmentError("ATTACHMENT_CONFLICT");
  }
  if(result.error) explain(result.error);
  return {record:check(result.data,expenseId,userId,id),existing:false};
}
async function complete(record,userId) {
  await requireAttachmentSession(userId);
  const {data,error} = await supabase.rpc("complete_expense_attachment",{p_attachment_id:record.id});
  if(error) explain(error);
  const ready = Array.isArray(data)?data[0]:data;
  if(!ready || ready.status!=="ready") throw attachmentError("ATTACHMENT_CONFIRM");
  return check(ready,record.expense_id,userId,record.id);
}
export async function uploadExpenseReceipt({file,expenseId,userId,id,signal,onProgress}) {
  let stage="validation";
  try {
    validateAttachmentBatch([file]);assertAttachmentActive(signal);
    stage="authentication";await requireAttachmentSession(userId);
    stage="reservation";const reservation=await reserve(file,expenseId,userId,id),record=reservation.record;
    assertAttachmentActive(signal);
    if(record.status==="ready") return record;
    if(reservation.existing) {
      stage="confirmation";
      try{return await complete(record,userId);}catch(error){if(error.code!=="22023" || !error.message?.includes("File has not finished uploading")) throw error;}
    }
    stage="transfer";await uploadAttachmentBytes({file,record,userId,signal,onProgress,bucket:EXPENSE_RECEIPT_BUCKET});
    assertAttachmentActive(signal);stage="confirmation";return await complete(record,userId);
  } catch(cause) {
    const error=new Error(cause?.message || String(cause));
    Object.assign(error,{code:cause?.code,status:cause?.status || cause?.statusCode,originalResponse:cause?.originalResponse,
      attachmentStage:stage,attachmentTransport:uploadTransport(file.size)});throw error;
  }
}
export async function removeExpenseReceipt(record,userId) {
  await requireAttachmentSession(userId);check(record,record.expense_id,userId);
  const {error:storageError}=await supabase.storage.from(EXPENSE_RECEIPT_BUCKET).remove([record.storage_path]);
  if(storageError) throw storageError;
  const {error}=await supabase.from("expense_attachments").delete().eq("id",record.id).eq("expense_id",record.expense_id).eq("user_id",userId);
  if(error) explain(error);
}
export async function discardExpenseReceipt(id,expenseId,userId) {
  await requireAttachmentSession(userId);
  const {data,error}=await supabase.from("expense_attachments").select("*").eq("id",id).eq("expense_id",expenseId).eq("user_id",userId).maybeSingle();
  if(error) explain(error);
  if(data) await removeExpenseReceipt(check(data,expenseId,userId,id),userId);
}
export async function downloadExpenseReceipt(record,userId,{signal}={}) {
  const session=await requireAttachmentSession(userId);assertAttachmentActive(signal);check(record,record.expense_id,userId);
  if(record.status!=="ready") throw attachmentError("ATTACHMENT_CONFIRM");
  const client=signal?createClient(process.env.REACT_APP_SUPABASE_URL,process.env.REACT_APP_SUPABASE_ANON_KEY,{
    auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
    global:{headers:{Authorization:"Bearer "+session.access_token},fetch:(input,init)=>fetch(input,{...init,signal})},
  }):supabase;
  const {data,error}=await client.storage.from(EXPENSE_RECEIPT_BUCKET).download(record.storage_path);
  if(error) throw error;assertAttachmentActive(signal);return data;
}
export async function deleteExpenseReceipts(expense,userId) {
  await requireAttachmentSession(userId);
  const current=await supabase.from("expenses").select("updated_at").eq("id",expense.id).eq("user_id",userId).maybeSingle();
  if(current.error) throw current.error;
  if(!current.data || current.data.updated_at!==expense.updatedAt) throw attachmentError("EXPENSE_CONFLICT");
  try {for(const record of await getExpenseReceipts(expense.id,userId)) await removeExpenseReceipt(record,userId);}
  catch(error) {
    if(error.code==="EXPENSE_RECEIPTS_SETUP_REQUIRED") throw error;
    throw Object.assign(new Error("EXPENSE_RECEIPT_CLEANUP_FAILED"),{code:"EXPENSE_RECEIPT_CLEANUP_FAILED",cause:error});
  }
}
// Adapter for the attachment panel shared with Notes. Domain records retain expense_id.
export const expenseReceiptPanelServices = {
  getAttachments:getExpenseReceipts,uploadAttachment:({parentId,...options})=>uploadExpenseReceipt({...options,expenseId:parentId}),
  removeAttachment:removeExpenseReceipt,discardAttachment:discardExpenseReceipt,downloadAttachment:downloadExpenseReceipt,
};
