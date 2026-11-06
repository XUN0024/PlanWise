import { Upload } from "tus-js-client";
import { createClient } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import { ATTACHMENT_BUCKET, attachmentError, validateAttachmentBatch } from "../lib/attachmentModel";

const assertActive = (signal) => {
  if (signal?.aborted) throw attachmentError("ATTACHMENT_CANCELLED");
};
const authenticatedSession = async (userId) => {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  if (!data.session || data.session.user.id !== userId) throw attachmentError("ATTACHMENT_AUTH");
  return data.session;
};
const assertRecord = (record, userId, noteId) => {
  if (!record || record.user_id !== userId || record.note_id !== noteId) throw attachmentError("ATTACHMENT_AUTH");
  return record;
};

export const getAttachments = async (noteId, userId) => {
  const { data, error } = await supabase.from("note_attachments").select("*")
    .eq("note_id", noteId).eq("user_id", userId).order("created_at", { ascending: true });
  if (error) throw error;
  return data || [];
};

const reserveAttachment = async (file, noteId, userId, id) => {
  const existing = await supabase.from("note_attachments").select("*")
    .eq("id", id).eq("note_id", noteId).eq("user_id", userId).maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data) {
    if (existing.data.original_name !== file.name || Number(existing.data.size_bytes) !== file.size) {
      throw attachmentError("ATTACHMENT_CONFLICT");
    }
    return { record: assertRecord(existing.data, userId, noteId), existing: true };
  }
  const { data, error } = await supabase.from("note_attachments").insert({
    id, note_id: noteId, user_id: userId, original_name: file.name,
    object_name: "file", size_bytes: file.size, mime_type: file.type || "application/octet-stream",
  }).select().single();
  if (error) throw error;
  return { record: assertRecord(data, userId, noteId), existing: false };
};

const completeAttachment = async (record) => {
  const { data, error } = await supabase.rpc("complete_note_attachment", { p_attachment_id: record.id });
  if (error) throw error;
  const ready = Array.isArray(data) ? data[0] : data;
  if (!ready || ready.status !== "ready") throw attachmentError("ATTACHMENT_CONFIRM");
  return assertRecord(ready, record.user_id, record.note_id);
};

export const resumableEndpoint = (projectUrl) => {
  const url = new URL(projectUrl);
  if (url.hostname.endsWith(".supabase.co") && !url.hostname.endsWith(".storage.supabase.co")) {
    url.hostname = url.hostname.replace(".supabase.co", ".storage.supabase.co");
  }
  return url.origin + "/storage/v1/upload/resumable";
};

export const uploadTransport = (size) => size <= 6 * 1024 * 1024 ? "standard" : "resumable";

const uploadStandard = async (file, record, userId, signal, onProgress) => {
  const session = await authenticatedSession(userId);
  assertActive(signal);
  // This SDK version does not forward FileOptions.signal. Use a per-request
  // client with an abortable fetch and the verified current user's credential.
  const client = createClient(process.env.REACT_APP_SUPABASE_URL, process.env.REACT_APP_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      headers: { Authorization: "Bearer " + session.access_token },
      fetch: (input, init) => fetch(input, { ...init, signal }),
    },
  });
  onProgress?.(null); // Standard SDK upload has no granular progress events.
  const { error } = await client.storage.from(ATTACHMENT_BUCKET).upload(record.storage_path, file, {
    upsert: false, contentType: file.type || "application/octet-stream", cacheControl: "3600",
  });
  assertActive(signal);
  if (error) throw error;
  onProgress?.(99);
};

const uploadResumable = async (file, record, userId, signal, onProgress) => {
  const session = await authenticatedSession(userId);
  assertActive(signal);
  return new Promise((resolve, reject) => {
    let upload;
    let settled = false;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener("abort", cancel);
      if (error) reject(error); else resolve();
    };
    const cancel = () => {
      if (upload) Promise.resolve(upload.abort(false)).catch(() => {});
      finish(attachmentError("ATTACHMENT_CANCELLED"));
    };
    upload = new Upload(file, {
      endpoint: resumableEndpoint(process.env.REACT_APP_SUPABASE_URL),
      chunkSize: 6 * 1024 * 1024,
      uploadDataDuringCreation: true,
      retryDelays: [0, 1000, 3000, 5000],
      removeFingerprintOnSuccess: true,
      fingerprint: async () => ["planwise", userId, record.note_id, record.id, file.size, file.lastModified].join(":"),
      headers: {
        authorization: "Bearer " + session.access_token,
        apikey: process.env.REACT_APP_SUPABASE_ANON_KEY,
        "x-upsert": "false",
      },
      metadata: {
        bucketName: ATTACHMENT_BUCKET, objectName: record.storage_path,
        contentType: file.type || "application/octet-stream", cacheControl: "3600",
      },
      onBeforeRequest: async (request) => {
        assertActive(signal);
        const current = await authenticatedSession(userId);
        request.setHeader("authorization", "Bearer " + current.access_token);
      },
      onProgress: (sent, total) => {
        if (!signal?.aborted) onProgress?.(total ? Math.min(99, Math.round(sent * 100 / total)) : 0);
      },
      onError: (error) => finish(error),
      onSuccess: () => finish(),
    });
    signal?.addEventListener("abort", cancel, { once: true });
    if (signal?.aborted) { cancel(); return; }
    upload.findPreviousUploads().then((previous) => {
      if (settled) return;
      if (previous.length) upload.resumeFromPreviousUpload(previous[0]);
      upload.start();
    }).catch((error) => finish(error));
  });
};

export const uploadAttachment = async ({ file, noteId, userId, id, signal, onProgress }) => {
  let stage = "validation";
  try {
    validateAttachmentBatch([file]);
    assertActive(signal);
    stage = "authentication";
    await authenticatedSession(userId);
    stage = "reservation";
    const reservation = await reserveAttachment(file, noteId, userId, id);
    const record = reservation.record;
    assertActive(signal);
    if (record.status === "ready") return record;
    if (reservation.existing) {
      stage = "confirmation";
      // Recover uploads whose bytes committed but whose response/confirmation was lost.
      try { return await completeAttachment(record); }
      catch (error) {
        if (error.code !== "22023" || !error.message?.includes("File has not finished uploading")) throw error;
      }
    }
    stage = "transfer";
    const transfer = uploadTransport(file.size) === "standard" ? uploadStandard : uploadResumable;
    await transfer(file, record, userId, signal, onProgress);
    assertActive(signal);
    await authenticatedSession(userId);
    stage = "confirmation";
    return await completeAttachment(record);
  } catch (cause) {
    const error = new Error(cause?.message || String(cause));
    error.code = cause?.code;
    error.status = cause?.status || cause?.statusCode;
    error.originalResponse = cause?.originalResponse;
    error.attachmentStage = stage;
    error.attachmentTransport = uploadTransport(file.size);
    throw error;
  }
};

export const removeAttachment = async (record, userId) => {
  await authenticatedSession(userId);
  assertRecord(record, userId, record.note_id);
  const { error: storageError } = await supabase.storage.from(ATTACHMENT_BUCKET).remove([record.storage_path]);
  if (storageError) throw storageError;
  const { error } = await supabase.from("note_attachments").delete()
    .eq("id", record.id).eq("user_id", userId).eq("note_id", record.note_id);
  if (error) throw error;
};

export const discardAttachment = async (id, noteId, userId) => {
  await authenticatedSession(userId);
  const { data, error } = await supabase.from("note_attachments").select("*")
    .eq("id", id).eq("note_id", noteId).eq("user_id", userId).maybeSingle();
  if (error) throw error;
  if (data) await removeAttachment(data, userId);
};

export const downloadAttachment = async (record, userId, { signal } = {}) => {
  const session = await authenticatedSession(userId);
  assertActive(signal);
  assertRecord(record, userId, record.note_id);
  const client = signal ? createClient(process.env.REACT_APP_SUPABASE_URL, process.env.REACT_APP_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: "Bearer " + session.access_token }, fetch: (input, init) => fetch(input, { ...init, signal }) },
  }) : supabase;
  const { data, error } = await client.storage.from(ATTACHMENT_BUCKET)
    .download(record.storage_path);
  if (error) throw error;
  assertActive(signal);
  return data;
};

export const deleteNoteAttachments = async (note, userId) => {
  await authenticatedSession(userId);
  const current = await supabase.from("notes").select("updated_at")
    .eq("id", note.id).eq("user_id", userId).maybeSingle();
  if (current.error) throw current.error;
  if (!current.data || current.data.updated_at !== note.updatedAt) {
    throw Object.assign(new Error("NOTE_CONFLICT"), { code: "NOTE_CONFLICT" });
  }
  const attachments = await getAttachments(note.id, userId);
  // Stop on failure: leave the note intact; already removed files stay removed.
  for (const record of attachments) await removeAttachment(record, userId);
};
