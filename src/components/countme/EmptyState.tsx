import { useRef, useState } from "react";
import { FileSpreadsheet, Upload, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { useCountMe } from "@/lib/countme/store";
import { cn } from "@/lib/utils";

type DropState = "idle" | "dragging" | "validating" | "error";

const ACCEPTED = /\.(xlsx|xlsm)$/i;

export function EmptyState() {
  const uploadFile = useCountMe((s) => s.uploadFile);
  const busy = useCountMe((s) => s.busy);
  const error = useCountMe((s) => s.error);
  const parsed = useCountMe((s) => s.parsed);
  const fileRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<DropState>("idle");
  const [localError, setLocalError] = useState<string | null>(null);
  const dragDepth = useRef(0);

  const handleFile = async (file: File | undefined | null) => {
    if (!file) return;
    setState("validating");
    setLocalError(null);
    if (!ACCEPTED.test(file.name)) {
      setState("error");
      setLocalError("Desteklenmeyen dosya türü. Lütfen .xlsx veya .xlsm dosyası seçin.");
      return;
    }
    if (file.size > 40 * 1024 * 1024) {
      setState("error");
      setLocalError("Dosya çok büyük (en fazla 40 MB).");
      return;
    }
    await uploadFile(file);
    setState("idle");
  };

  const message =
    localError ??
    error ??
    (busy
      ? "Excel okunuyor…"
      : state === "validating"
        ? "Dosya doğrulanıyor…"
        : state === "dragging"
          ? "Bırakın, yükleyelim"
          : null);

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
        onChange={(e) => {
          void handleFile(e.target.files?.[0]);
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
          dragDepth.current += 1;
          setState("dragging");
        }}
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          dragDepth.current = Math.max(0, dragDepth.current - 1);
          if (dragDepth.current === 0) setState("idle");
        }}
        onDrop={(e) => {
          e.preventDefault();
          dragDepth.current = 0;
          void handleFile(e.dataTransfer.files?.[0]);
        }}
        className={cn(
          "flex w-full max-w-lg flex-col items-center gap-3 rounded-2xl border-2 border-dashed px-6 py-10 transition-colors",
          state === "dragging"
            ? "border-primary bg-primary/10"
            : state === "error" || localError || error
              ? "border-destructive bg-destructive/5"
              : "border-border bg-secondary/40 hover:border-primary hover:bg-secondary",
        )}
      >
        {busy || state === "validating" ? (
          <Loader2 className="size-10 animate-spin text-primary" />
        ) : parsed ? (
          <CheckCircle2 className="size-10 text-primary" />
        ) : localError || error ? (
          <AlertCircle className="size-10 text-destructive" />
        ) : (
          <FileSpreadsheet className="size-10 text-primary" />
        )}
        <span className="text-sm font-semibold text-foreground">
          Excel dosyanızı buraya sürükleyin veya seçmek için tıklayın
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
          className={cn(
            "text-sm",
            localError || error ? "text-destructive" : "text-muted-foreground",
          )}
        >
          {message}
        </p>
      )}
      <p className="text-xs text-muted-foreground">Orijinal dosyanız hiçbir zaman değiştirilmez.</p>
    </div>
  );
}