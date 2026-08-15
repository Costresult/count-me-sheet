import { useRef } from "react";
import { useCountMe } from "@/lib/countme/store";
import { cn } from "@/lib/utils";
import {
  Upload,
  Play,
  Pause,
  Undo2,
  CheckCircle2,
  Columns3,
  Maximize2,
  RotateCcw,
  Rows3,
  Menu,
  LogOut,
  Download,
} from "lucide-react";

const statusLabel: Record<string, string> = {
  IDLE: "Hazır",
  RUNNING: "Devam Ediyor",
  PAUSED: "Duraklatıldı",
  PAUSED_BY_USER: "Duraklatıldı",
  COMPLETED: "Tamamlandı",
};

function TBtn({
  onClick,
  icon: Icon,
  label,
  variant = "ghost",
  disabled,
}: {
  onClick: () => void;
  icon: typeof Play;
  label: string;
  variant?: "ghost" | "primary";
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-[13px] font-medium transition-colors disabled:opacity-40",
        variant === "primary"
          ? "bg-primary text-primary-foreground hover:bg-primary/90"
          : "text-foreground hover:bg-secondary",
      )}
    >
      <Icon className="size-4" />
      <span className="whitespace-nowrap">{label}</span>
    </button>
  );
}

export function Toolbar() {
  const s = useCountMe();
  const fileRef = useRef<HTMLInputElement>(null);

  const autoFitAll = () =>
    (window as unknown as { __countmeAutoFitAll?: () => void }).__countmeAutoFitAll?.();

  return (
    <header className="z-40 flex flex-col gap-1 border-b border-border bg-card px-2 py-1.5 shadow-sm">
      <div className="flex items-center gap-1 overflow-x-auto">
        <button
          type="button"
          aria-label="Envanterler"
          onClick={() => s.setSidebarOpen(true)}
          className="mr-1 inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md px-2 text-[13px] font-medium text-foreground hover:bg-secondary md:hidden"
        >
          <Menu className="size-4" />
          Envanterler
        </button>
        <span className="mr-1 shrink-0 text-sm font-black tracking-tight text-primary">COUNT ME</span>
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.xlsm"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void s.uploadFile(f);
            e.target.value = "";
          }}
        />
        <TBtn onClick={() => fileRef.current?.click()} icon={Upload} label="Excel Yükle" variant="primary" />
        {s.parsed && (
          <>
            <TBtn onClick={() => void s.exitWorkspace()} icon={LogOut} label="Envanterden Çık" />
            {s.status !== "RUNNING" ? (
              <TBtn onClick={() => s.setStatus("RUNNING")} icon={Play} label={s.status === "IDLE" ? "Envantere Başla" : "Devam Et"} />
            ) : (
              <TBtn onClick={() => s.setStatus("PAUSED")} icon={Pause} label="Duraklat" />
            )}
            <TBtn onClick={s.undoLast} icon={Undo2} label="Geri Al" disabled={s.undoStack.length === 0} />
            <TBtn
              onClick={() => s.activeId && void s.downloadSession(s.activeId)}
              icon={Download}
              label="Excel'i İndir"
            />
            <TBtn onClick={() => void s.exportFile()} icon={CheckCircle2} label="Envanteri Bitir" />
            <div className="mx-1 h-6 w-px shrink-0 bg-border" />
            <TBtn onClick={autoFitAll} icon={Columns3} label="Tüm Kolonları Sığdır" />
            <TBtn
              onClick={() => s.setRowHeight(s.view.rowHeight >= 44 ? 28 : s.view.rowHeight + 8)}
              icon={Rows3}
              label="Satır Yüksekliği"
            />
            <TBtn onClick={s.resetView} icon={RotateCcw} label="Görünümü Sıfırla" />
          </>
        )}
      </div>

      {s.parsed && (
        <div className="flex items-center gap-2 overflow-x-auto text-[11px] text-muted-foreground">
          <select
            value={s.sheetName ?? ""}
            onChange={(e) => void s.selectSheet(e.target.value)}
            className="h-7 shrink-0 rounded border border-border bg-background px-1.5 text-[12px] text-foreground"
            aria-label="Çalışma sayfası"
          >
            {s.sheetNames.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          <span className="shrink-0 truncate font-medium text-foreground">{s.name ?? s.fileName}</span>
          <span className="shrink-0">{s.parsed.rows.length} satır</span>
          <span className="shrink-0">{s.parsed.columns.length} kolon</span>
          <span
            className={cn(
              "shrink-0 rounded-full px-2 py-0.5 font-medium",
              s.status === "RUNNING" ? "bg-primary/15 text-primary" : "bg-secondary text-secondary-foreground",
            )}
          >
            {statusLabel[s.status]}
          </span>
          {s.savedAt && (
            <span className="shrink-0 inline-flex items-center gap-1 text-primary">
              <Maximize2 className="size-3 rotate-45 opacity-0" />
              Kaydedildi
            </span>
          )}
        </div>
      )}
    </header>
  );
}