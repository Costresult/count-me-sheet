import { cloudDocs } from "@/lib/countme/cloud";

/**
 * Durable list of what the recognizer heard and what happened to it, so recognition mistakes
 * can be studied later: heard + matched, heard + not matched, skipped, and heard + what the
 * user chose instead of the suggestion.
 */
export type VoiceLogKind =
  | "matched" // written automatically
  | "asked" // a decision popup was shown
  | "chosen" // the user picked an option / row (a correction when it differs from the suggestion)
  | "unmatched" // no product found
  | "skipped" // ATLA
  | "cancelled"
  | "command"
  | "ignored";

export interface VoiceLogRecord {
  id: string;
  ts: number;
  sessionId: string | null;
  kind: VoiceLogKind;
  /** exactly what the recognizer returned */
  heard: string;
  /** the product text left after parsing numbers/units */
  productText?: string | undefined;
  page: number;
  /** row the system wrote to or suggested first */
  suggested?: string | undefined;
  /** row the user picked (kind "chosen") */
  chosen?: string | undefined;
  /** value written / proposed */
  value?: number | null | undefined;
  /** other candidates shown to the user */
  candidates?: string[] | undefined;
  note?: string | undefined;
  /** the user marked this record as wrong ("düzelt"): what they expected instead, if they said */
  flag?: { at: number; note: string } | undefined;
}

const queue: VoiceLogRecord[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
const MAX_QUEUE = 500;

async function flush() {
  timer = null;
  if (queue.length === 0) return;
  const batch = queue.splice(0, queue.length);
  try {
    await cloudDocs.putMany("voicelog", batch);
  } catch {
    // keep for the next attempt, never block counting
    queue.unshift(...batch.slice(-MAX_QUEUE));
    timer = setTimeout(() => void flush(), 15_000);
  }
}

/** Queues a record; sent to the cloud in small batches. */
export function logVoice(rec: Omit<VoiceLogRecord, "id" | "ts"> & { id?: string; ts?: number }) {
  queue.push({
    ...rec,
    id: rec.id ?? `v${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    ts: rec.ts ?? Date.now(),
  });
  if (queue.length > MAX_QUEUE) queue.splice(0, queue.length - MAX_QUEUE);
  if (!timer) timer = setTimeout(() => void flush(), 3000);
}

export async function flushVoiceLog() {
  if (timer) clearTimeout(timer);
  await flush();
}

/**
 * Marks a record as needing a fix, with an optional note on what should have happened.
 * Returns false when the record cannot be found.
 */
export async function flagVoiceLog(id: string, note: string): Promise<boolean> {
  await flushVoiceLog();
  const rec = (await cloudDocs.get("voicelog", id)) as VoiceLogRecord | undefined;
  if (!rec) return false;
  await cloudDocs.put("voicelog", { ...rec, flag: { at: Date.now(), note: note.trim() } });
  return true;
}

/** The latest records (newest first), read from the account so the list survives a page refresh. */
export async function recentVoiceLog(limit = 60): Promise<VoiceLogRecord[]> {
  await flushVoiceLog();
  const rows = (await cloudDocs.getRecent("voicelog", limit)) as VoiceLogRecord[];
  return rows.sort((x, y) => y.ts - x.ts);
}

export async function listVoiceLog(): Promise<VoiceLogRecord[]> {
  await flushVoiceLog();
  const all = (await cloudDocs.getAll("voicelog")) as VoiceLogRecord[];
  return all.sort((a, b) => b.ts - a.ts);
}

export const kindLabel: Record<VoiceLogKind, string> = {
  matched: "Eşleşti (otomatik yazıldı)",
  asked: "Soruldu",
  chosen: "Seçildi",
  unmatched: "Eşleşmedi",
  skipped: "Atlandı",
  cancelled: "İptal",
  command: "Komut",
  ignored: "Yok sayıldı",
};

const csvCell = (v: unknown) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** CSV with a UTF-8 BOM so Excel opens Turkish characters correctly. */
export function voiceLogToCsv(records: VoiceLogRecord[]): string {
  const head = ["Zaman", "Sonuç", "Duyulan", "Ürün metni", "Sayfa", "Önerilen / eşleşen", "Seçilen", "Değer", "Diğer adaylar", "Not", "Düzelt notu"];
  const rows = records.map((r) => [
    new Date(r.ts).toLocaleString("tr-TR"),
    kindLabel[r.kind],
    r.heard,
    r.productText,
    r.page,
    r.suggested,
    r.chosen,
    r.value,
    r.candidates?.join(" | "),
    r.note,
    r.flag ? `DÜZELT: ${r.flag.note}` : "",
  ]);
  return "﻿" + [head, ...rows].map((row) => row.map(csvCell).join(";")).join("\n");
}
