import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { BUCKET, requireUserId } from "./cloud";
import type { SessionMeta, SessionStatus, StoredSession } from "./types";

/** Inventories live in the cloud database; the original xlsx lives in private storage. */

const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** Sessions whose original file is known to be in storage (skips re-uploading on every save). */
const uploaded = new Set<string>();

interface SessionData {
  edits?: StoredSession["edits"];
  formulas?: Record<string, string>;
  view?: StoredSession["view"];
  pages?: StoredSession["pages"] | undefined;
  addedColumns?: StoredSession["addedColumns"];
  unmatched?: StoredSession["unmatched"];
  history?: StoredSession["history"];
}

export const toMeta = (s: StoredSession): SessionMeta => ({
  id: s.id,
  name: s.name,
  fileName: s.fileName,
  sheetName: s.sheetName,
  status: s.status,
  editCount: Object.keys(s.edits ?? {}).length,
  createdAt: s.createdAt,
  updatedAt: s.updatedAt,
});

const pathFor = (uid: string, id: string) => `${uid}/${id}.xlsx`;

export async function saveSession(session: StoredSession) {
  const uid = await requireUserId();
  const path = pathFor(uid, session.id);
  if (!uploaded.has(session.id)) {
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, new Blob([session.originalFile], { type: XLSX }), { upsert: true, contentType: XLSX });
    if (error) throw error;
    uploaded.add(session.id);
  }
  const data: SessionData = {
    edits: session.edits ?? {},
    formulas: session.formulas ?? {},
    view: session.view,
    pages: session.pages,
    addedColumns: session.addedColumns ?? [],
    unmatched: session.unmatched ?? [],
    history: session.history ?? [],
  };
  const { error } = await supabase.from("count_sessions").upsert(
    {
      id: session.id,
      name: session.name,
      file_name: session.fileName,
      sheet_name: session.sheetName,
      status: session.status,
      edit_count: Object.keys(session.edits ?? {}).length,
      original_path: path,
      data: data as unknown as Json,
      created_at: session.createdAt,
      updated_at: session.updatedAt,
    },
    { onConflict: "user_id,id" },
  );
  if (error) throw error;
}

export async function getSession(id: string): Promise<StoredSession | null> {
  const { data: row, error } = await supabase.from("count_sessions").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!row || !row.original_path) return null;
  const file = await supabase.storage.from(BUCKET).download(row.original_path);
  if (file.error || !file.data) throw file.error ?? new Error("Orijinal Excel dosyası okunamadı.");
  uploaded.add(id);
  const d = (row.data ?? {}) as unknown as Partial<SessionData>;
  const session: StoredSession = {
    id: row.id,
    name: row.name ?? row.file_name ?? "Envanter",
    fileName: row.file_name ?? "envanter.xlsx",
    originalFile: await file.data.arrayBuffer(),
    sheetName: row.sheet_name,
    status: (row.status as SessionStatus | null) ?? "IDLE",
    edits: d.edits ?? {},
    formulas: d.formulas ?? {},
    view: d.view as StoredSession["view"],
    addedColumns: d.addedColumns ?? [],
    unmatched: d.unmatched ?? [],
    history: d.history ?? [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
  if (d.pages) session.pages = d.pages;
  return session;
}

export async function listSessions(): Promise<SessionMeta[]> {
  const { data, error } = await supabase
    .from("count_sessions")
    .select("id,name,file_name,sheet_name,status,edit_count,created_at,updated_at")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id,
    name: r.name ?? r.file_name ?? "Envanter",
    fileName: r.file_name ?? "",
    sheetName: r.sheet_name,
    status: (r.status as SessionStatus | null) ?? "IDLE",
    editCount: r.edit_count ?? 0,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}

export async function deleteSession(id: string) {
  const uid = await requireUserId();
  const { error } = await supabase.from("count_sessions").delete().eq("id", id);
  if (error) throw error;
  await supabase.storage.from(BUCKET).remove([pathFor(uid, id)]);
  uploaded.delete(id);
  if ((await getActiveId()) === id) await setActiveId(null);
}

export async function renameSession(id: string, name: string) {
  const { error } = await supabase.from("count_sessions").update({ name, updated_at: Date.now() }).eq("id", id);
  if (error) throw error;
}

export async function setActiveId(id: string | null) {
  const { error } = await supabase.from("count_app_state").upsert({ active_id: id }, { onConflict: "user_id" });
  if (error) throw error;
}

export async function getActiveId(): Promise<string | null> {
  const { data, error } = await supabase.from("count_app_state").select("active_id").maybeSingle();
  if (error) throw error;
  return data?.active_id ?? null;
}
