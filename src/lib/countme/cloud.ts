import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";

/** Document tables used for learned data (aliases, corrections, unit corrections). */
export type DocStore = "aliases" | "corrections" | "unitmap" | "voicelog";

const TABLES = {
  aliases: "count_aliases",
  corrections: "count_corrections",
  unitmap: "count_unit_corrections",
  voicelog: "count_voice_log",
} as const;

export const BUCKET = "count-originals";

export async function requireUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  const id = data.session?.user.id;
  if (!id) throw new Error("Oturum açık değil. Lütfen giriş yapın.");
  return id;
}

/** Small key/value document API over the per-user jsonb tables. */
export const cloudDocs = {
  async getAll(store: DocStore): Promise<unknown[]> {
    const { data, error } = await supabase
      .from(TABLES[store])
      .select("data")
      .order("updated_at", { ascending: false })
      .limit(5000);
    if (error) throw error;
    return (data ?? []).map((r) => r.data);
  },

  /** Newest documents first, for lists that only need the latest few. */
  async getRecent(store: DocStore, limit: number): Promise<unknown[]> {
    const { data, error } = await supabase
      .from(TABLES[store])
      .select("data")
      .order("updated_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data ?? []).map((r) => r.data);
  },

  async get(store: DocStore, id: string): Promise<unknown | undefined> {
    const { data, error } = await supabase
      .from(TABLES[store])
      .select("data")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    return data?.data ?? undefined;
  },

  async put<T extends { id: string }>(store: DocStore, value: T): Promise<void> {
    const { error } = await supabase
      .from(TABLES[store])
      .upsert({ id: value.id, data: value as unknown as Json, updated_at: Date.now() }, { onConflict: "user_id,id" });
    if (error) throw error;
  },

  async putMany<T extends { id: string }>(store: DocStore, values: T[]): Promise<void> {
    if (values.length === 0) return;
    const now = Date.now();
    const { error } = await supabase.from(TABLES[store]).upsert(
      values.map((v) => ({ id: v.id, data: v as unknown as Json, updated_at: now })),
      { onConflict: "user_id,id" },
    );
    if (error) throw error;
  },

  async delete(store: DocStore, id: string): Promise<void> {
    const { error } = await supabase.from(TABLES[store]).delete().eq("id", id);
    if (error) throw error;
  },
};
