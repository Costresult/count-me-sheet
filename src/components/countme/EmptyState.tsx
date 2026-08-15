import { useRef } from "react";
import { FileSpreadsheet, Upload } from "lucide-react";
import { useCountMe } from "@/lib/countme/store";

export function EmptyState() {
  const uploadFile = useCountMe((s) => s.uploadFile);
  const busy = useCountMe((s) => s.busy);
  const error = useCountMe((s) => s.error);
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
      <FileSpreadsheet className="size-12 text-primary" />
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
          const f = e.target.files?.[0];
          if (f) void uploadFile(f);
          e.target.value = "";
        }}
      />
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        disabled={busy}
        className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
      >
        <Upload className="size-4" />
        {busy ? "Okunuyor…" : "Excel Yükle"}
      </button>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <p className="text-xs text-muted-foreground">Orijinal dosyanız hiçbir zaman değiştirilmez.</p>
    </div>
  );
}