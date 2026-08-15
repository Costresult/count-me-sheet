import { useRef, useState } from "react";
import { FileSpreadsheet, Upload, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { useCountMe, uploadPhaseLabels } from "@/lib/countme/store";
import { cn } from "@/lib/utils";

export function EmptyState() {
  const uploadFile = useCountMe((s) => s.uploadFile);
  const phase = useCountMe((s) => s.uploadPhase);
  const error = useCountMe((s) => s.error);
  const sessions = useCountMe((s) => s.sessions);
  const openSession = useCountMe((s) => s.openSession);
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);

  // Single shared pipeline for both click-to-select and drag & drop.
  const handleFile = (file: File | undefined | null) => {
    if (!file) return;
    void uploadFile(file);
  };

  const busy = phase === "validating" || phase === "reading" || phase === "parsing";
  const isError = phase === "error" && !!error;
  const message = isError
    ? error
    : dragging
      ? "Dosyayı bırakın"
      : uploadPhaseLabels[phase];

  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 px-4 py-6 text-center sm:px-6">
      <div>
        <h1 className="text-xl font-bold text-foreground">Count Me — Envanter Sayım Aracı</h1>
        <p className="mt-1 max-w-md text-sm text-muted-foreground">
          Excel dosyanızı yükleyin; sayfa yapınız, formülleriniz ve satır sıranız korunarak
          doğrudan tablo üzerinde sayım yapın.
        </p>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept=".xlsx,.xlsm"
        className="hidden"
        data-testid="empty-file-input"
        onChange={(e) => {
          handleFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <button
        type="button"
        data-testid="dropzone"
        aria-label="Excel dosyanızı buraya sürükleyin veya seçmek için tıklayın"
        onClick={() => fileRef.current?.click()}
        onDragEnter={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
          dragDepth.current += 1;
          setDragging(true);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
          e.dataTransfer.dropEffect = "copy";
          if (!dragging) setDragging(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          e.stopPropagation();
          dragDepth.current = Math.max(0, dragDepth.current - 1);
          if (dragDepth.current === 0) setDragging(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          dragDepth.current = 0;
          setDragging(false);
          handleFile(e.dataTransfer?.files?.[0]);
        }}
        className={cn(
          "flex w-full max-w-lg flex-col items-center gap-3 rounded-2xl border-2 border-dashed px-6 py-10 transition-colors",
          dragging
            ? "border-primary bg-primary/10"
            : isError
              ? "border-destructive bg-destructive/5"
              : "border-border bg-secondary/40 hover:border-primary hover:bg-secondary",
        )}
      >
        {busy ? (
          <Loader2 className="size-10 animate-spin text-primary" />
        ) : phase === "success" ? (
          <CheckCircle2 className="size-10 text-primary" />
        ) : isError ? (
          <AlertCircle className="size-10 text-destructive" />
        ) : (
          <FileSpreadsheet className="size-10 text-primary" />
        )}
        <span className="text-sm font-semibold text-foreground" data-testid="dropzone-label">
          {dragging
            ? "Dosyayı bırakın"
            : "Excel dosyanızı buraya sürükleyin veya seçmek için tıklayın"}
        </span>
        <span className="text-xs text-muted-foreground">.xlsx / .xlsm</span>
        <span
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground"
        >
          <Upload className="size-4" />
          {busy ? "Okunuyor…" : "Excel Yükle"}
        </span>
      </button>
      {message && (
        <p
          role="status"
          data-testid="upload-status"
          className={cn("text-sm", isError ? "text-destructive" : "text-muted-foreground")}
        >
          {message}
        </p>
      )}
      <p className="text-xs text-muted-foreground">Orijinal dosyanız hiçbir zaman değiştirilmez.</p>

      {sessions.length > 0 && (
        <div className="w-full max-w-lg md:hidden">
          <p className="mb-1 text-left text-[11px] font-semibold uppercase text-muted-foreground">
            Kayıtlı envanterler
          </p>
          <div className="flex flex-col gap-1">
            {sessions.slice(0, 6).map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => void openSession(m.id)}
                className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-left text-[13px] hover:bg-secondary"
              >
                <span className="truncate font-medium text-foreground">{m.name}</span>
                <span className="shrink-0 text-[11px] text-muted-foreground">
                  {m.status === "COMPLETED" ? "Tamamlandı" : "Devam Ediyor"}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}