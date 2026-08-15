import { useRef, useState } from "react";
import {
  MoreHorizontal,
  Plus,
  PanelLeftClose,
  PanelLeftOpen,
  Download,
  Pencil,
  Trash2,
  PlayCircle,
  FileSpreadsheet,
  CheckCircle2,
  Clock,
} from "lucide-react";
import { useCountMe } from "@/lib/countme/store";
import { statusLabels, type SessionMeta } from "@/lib/countme/types";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

const fmt = (t: number) =>
  new Date(t).toLocaleString("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

function Item({ meta }: { meta: SessionMeta }) {
  const activeId = useCountMe((s) => s.activeId);
  const openSession = useCountMe((s) => s.openSession);
  const renameSession = useCountMe((s) => s.renameSession);
  const removeSession = useCountMe((s) => s.removeSession);
  const downloadSession = useCountMe((s) => s.downloadSession);
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(meta.name);
  const [confirming, setConfirming] = useState(false);
  const isActive = activeId === meta.id;

  return (
    <div
      className={cn(
        "group rounded-lg border border-transparent px-2 py-2 transition-colors hover:bg-secondary",
        isActive && "border-primary/40 bg-primary/10",
      )}
      data-testid="inventory-item"
      data-name={meta.name}
    >
      <div className="flex items-start gap-1">
        <button
          type="button"
          onClick={() => void openSession(meta.id)}
          className="min-w-0 flex-1 text-left"
        >
          {renaming ? (
            <input
              autoFocus
              value={draft}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={() => {
                void renameSession(meta.id, draft);
                setRenaming(false);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                if (e.key === "Escape") {
                  setDraft(meta.name);
                  setRenaming(false);
                }
              }}
              className="w-full rounded border border-border bg-background px-1 text-[13px] outline-none focus:ring-2 focus:ring-ring"
            />
          ) : (
            <span className="block truncate text-[13px] font-semibold text-foreground">
              {meta.name}
            </span>
          )}
          <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground">
            <span
              className={cn(
                "rounded-full px-1.5 py-0.5",
                meta.status === "COMPLETED"
                  ? "bg-primary/15 text-primary"
                  : "bg-secondary text-secondary-foreground",
              )}
            >
              {statusLabels[meta.status]}
            </span>
            {meta.sheetName && <span className="truncate">{meta.sheetName}</span>}
            <span>{fmt(meta.updatedAt)}</span>
          </span>
        </button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={`${meta.name} işlemleri`}
              className="shrink-0 rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <MoreHorizontal className="size-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onSelect={() => void openSession(meta.id)}>
              <PlayCircle className="size-4" />
              {meta.status === "COMPLETED" ? "Aç" : "Aç / Devam Et"}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => void downloadSession(meta.id)}>
              <Download className="size-4" />
              Excel'i İndir
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={(e) => {
                e.preventDefault();
                setDraft(meta.name);
                setRenaming(true);
              }}
            >
              <Pencil className="size-4" />
              Yeniden Adlandır
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onSelect={(e) => {
                e.preventDefault();
                setConfirming(true);
              }}
            >
              <Trash2 className="size-4" />
              Sil
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Envanter silinsin mi?</AlertDialogTitle>
            <AlertDialogDescription>
              “{meta.name}” envanteri ve içindeki sayım verileri kalıcı olarak silinecek. Bu işlem geri
              alınamaz.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Vazgeç</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                void removeSession(meta.id);
                setConfirming(false);
              }}
            >
              Sil
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Section({ title, icon: Icon, items }: { title: string; icon: typeof Clock; items: SessionMeta[] }) {
  return (
    <div className="px-2 py-2">
      <div className="mb-1 flex items-center gap-1.5 px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        <Icon className="size-3.5" />
        {title}
        <span className="ml-auto">{items.length}</span>
      </div>
      {items.length === 0 ? (
        <p className="px-1 py-1 text-[11px] text-muted-foreground">Kayıt yok</p>
      ) : (
        <div className="flex flex-col gap-0.5">
          {items.map((m) => (
            <Item key={m.id} meta={m} />
          ))}
        </div>
      )}
    </div>
  );
}

export function SidebarPanel() {
  const sessions = useCountMe((s) => s.sessions);
  const uploadFile = useCountMe((s) => s.uploadFile);
  const setSidebarOpen = useCountMe((s) => s.setSidebarOpen);
  const fileRef = useRef<HTMLInputElement>(null);

  const ongoing = sessions.filter((s) => s.status !== "COMPLETED");
  const done = sessions.filter((s) => s.status === "COMPLETED");

  return (
    <div className="flex h-full min-h-0 flex-col bg-card">
      <div className="flex items-center gap-2 border-b border-border px-2 py-2">
        <FileSpreadsheet className="size-4 text-primary" />
        <span className="text-[13px] font-black tracking-tight text-primary">ENVANTERLER</span>
      </div>
      <div className="p-2">
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.xlsm"
          className="hidden"
          data-testid="sidebar-file-input"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) {
              setSidebarOpen(false);
              void uploadFile(f);
            }
            e.target.value = "";
          }}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="inline-flex w-full items-center justify-center gap-1.5 rounded-md bg-primary px-3 py-2 text-[13px] font-semibold text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="size-4" />
          Yeni Envanter
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto pb-4">
        <Section title="Devam Edenler" icon={Clock} items={ongoing} />
        <Section title="Tamamlananlar" icon={CheckCircle2} items={done} />
      </div>
    </div>
  );
}

export function InventorySidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const sidebarOpen = useCountMe((s) => s.sidebarOpen);
  const setSidebarOpen = useCountMe((s) => s.setSidebarOpen);

  return (
    <>
      {/* desktop */}
      <aside
        data-testid="desktop-sidebar"
        className={cn(
          "hidden shrink-0 border-r border-border md:flex md:flex-col",
          collapsed ? "w-11" : "w-64",
        )}
      >
        <button
          type="button"
          aria-label={collapsed ? "Kenar çubuğunu aç" : "Kenar çubuğunu kapat"}
          onClick={() => setCollapsed((c) => !c)}
          className="flex h-9 shrink-0 items-center gap-2 border-b border-border bg-card px-2.5 text-[12px] text-muted-foreground hover:bg-secondary"
        >
          {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
          {!collapsed && <span>Gizle</span>}
        </button>
        {!collapsed && (
          <div className="min-h-0 flex-1">
            <SidebarPanel />
          </div>
        )}
      </aside>

      {/* mobile drawer */}
      <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <SheetContent side="left" className="w-[86vw] max-w-sm p-0">
          <SheetHeader className="sr-only">
            <SheetTitle>Envanterler</SheetTitle>
          </SheetHeader>
          <SidebarPanel />
        </SheetContent>
      </Sheet>
    </>
  );
}
