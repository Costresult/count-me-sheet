import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Check, Download, Sparkles, Trash2 } from "lucide-react";
import { useState } from "react";
import { useVoice, type TranscriptEntry } from "@/lib/voice/store";
import { kindLabel, listVoiceLog, voiceLogToCsv, type VoiceLogKind } from "@/lib/voice/log";

/** Downloads the durable recognition list (heard / matched / skipped / chosen) as CSV. */
function VoiceLogExport() {
  const [busy, setBusy] = useState(false);
  const [counts, setCounts] = useState<Partial<Record<VoiceLogKind, number>> | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async (download: boolean) => {
    setBusy(true);
    setError(null);
    try {
      const all = await listVoiceLog();
      const c: Partial<Record<VoiceLogKind, number>> = {};
      for (const r of all) c[r.kind] = (c[r.kind] ?? 0) + 1;
      setCounts(c);
      if (download) {
        const url = URL.createObjectURL(
          new Blob([voiceLogToCsv(all)], { type: "text/csv;charset=utf-8" }),
        );
        const a = document.createElement("a");
        a.href = url;
        a.download = `ses-kayitlari-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch {
      setError("Kayıt listesi okunamadı.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-1.5 rounded-md border border-border p-2">
      <h3 className="text-[13px] font-semibold">Ses kayıt listesi</h3>
      <p className="text-[12px] text-muted-foreground">
        Duyulan, eşleşen, eşleşmeyen, atlanan ve sizin seçtiğiniz her kayıt hesabınızda saklanır.
      </p>
      {counts && (
        <p className="text-[12px]" data-testid="voice-log-counts">
          {(Object.keys(counts) as VoiceLogKind[])
            .map((k) => `${kindLabel[k]}: ${counts[k]}`)
            .join(" · ") || "Henüz kayıt yok."}
        </p>
      )}
      {error && <p className="text-[12px] text-destructive">{error}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void load(false)}
          className="rounded-md border border-border px-2 py-1 text-[12px] hover:bg-secondary"
        >
          Say
        </button>
        <button
          type="button"
          disabled={busy}
          data-testid="voice-log-download"
          onClick={() => void load(true)}
          className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[12px] hover:bg-secondary"
        >
          <Download className="size-3.5" /> CSV indir
        </button>
      </div>
    </div>
  );
}

/** One line of the recent list, with the "send to Claude to fix" button. */
export function EntryRow({ entry }: { entry: TranscriptEntry }) {
  const flagEntry = useVoice((s) => s.flagEntry);
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const send = async () => {
    setBusy(true);
    setFailed(false);
    const ok = await flagEntry(entry.id, note);
    setBusy(false);
    if (ok) setOpen(false);
    else setFailed(true);
  };

  return (
    <div className="text-[12px] text-muted-foreground" data-testid="voice-entry">
      <div className="flex items-start gap-1.5">
        <p className="min-w-0 flex-1">
          <span className="font-medium text-foreground">S{entry.physicalPage}</span> “
          {entry.rawTranscript}” · {entry.outcome}
          {entry.detail ? ` · ${entry.detail}` : ""}
        </p>
        {entry.flagged ? (
          <span
            className="inline-flex shrink-0 items-center gap-0.5 text-primary"
            title="Düzeltilmek üzere işaretlendi"
          >
            <Check className="size-3.5" />
          </span>
        ) : (
          <button
            type="button"
            data-testid="flag-entry"
            title="Bu kayıt yanlış: düzeltilmek üzere işaretle"
            onClick={() => setOpen((v) => !v)}
            className="inline-flex size-6 shrink-0 items-center justify-center rounded text-primary hover:bg-primary/10"
          >
            <Sparkles className="size-3.5" />
          </button>
        )}
      </div>
      {open && !entry.flagged && (
        <div className="mt-1 flex gap-1.5">
          <input
            data-testid="flag-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Ne olması gerekirdi? (isteğe bağlı)"
            className="min-w-0 flex-1 rounded border border-border bg-background px-2 py-1 text-[12px] text-foreground"
          />
          <button
            type="button"
            disabled={busy}
            data-testid="flag-send"
            onClick={() => void send()}
            className="rounded bg-primary px-2 py-1 text-[12px] font-semibold text-primary-foreground"
          >
            {busy ? "…" : "Düzelt"}
          </button>
        </div>
      )}
      {failed && <p className="mt-0.5 text-destructive">İşaretlenemedi, tekrar deneyin.</p>}
    </div>
  );
}

/** Review / delete learned pronunciations so a wrong correction can be undone. */
export function VoiceMemoryPanel() {
  const open = useVoice((s) => s.panelOpen);
  const setOpen = useVoice((s) => s.setPanelOpen);
  const aliases = useVoice((s) => s.aliases);
  const forget = useVoice((s) => s.forgetAlias);
  const entries = useVoice((s) => s.entries);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent side="right" className="flex w-full flex-col gap-3 overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Öğrenilen Telaffuzlar</SheetTitle>
          <SheetDescription>
            Sizin seçimlerinizden öğrenilen eşleştirmeler. Yanlış bir öğrenmeyi buradan
            silebilirsiniz.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-2">
          {aliases.length === 0 && (
            <p className="text-[13px] text-muted-foreground">Henüz kayıt yok.</p>
          )}
          {aliases
            .slice()
            .sort((a, b) => b.lastUsed - a.lastUsed)
            .map((a) => (
              <div
                key={a.id}
                data-testid="alias-item"
                className="flex items-center gap-2 rounded-md border border-border p-2 text-[13px]"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">
                    “{a.spokenAlias}” → {a.targetProductName}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {a.correctionCount}× · güven {Math.round(a.confidence * 100)}%
                    {a.targetUnit ? ` · ${a.targetUnit}` : ""}
                  </p>
                </div>
                <button
                  type="button"
                  aria-label="Sil"
                  onClick={() => void forget(a.id)}
                  className="inline-flex size-8 items-center justify-center rounded-md text-destructive hover:bg-destructive/10"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            ))}
        </div>

        <VoiceLogExport />

        <div>
          <h3 className="mb-1 text-[13px] font-semibold">Son ses kayıtları</h3>
          <div className="space-y-1">
            {entries.slice(0, 15).map((e) => (
              <EntryRow key={e.id} entry={e} />
            ))}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
