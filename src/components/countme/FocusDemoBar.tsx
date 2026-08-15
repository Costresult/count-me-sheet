import { useState } from "react";
import { Crosshair, Search } from "lucide-react";
import { useCountMe } from "@/lib/countme/store";

/** Test surface for the future voice/follow mode: focusProductRow / focusCell. */
export function FocusDemoBar() {
  const parsed = useCountMe((s) => s.parsed);
  const focusProductRow = useCountMe((s) => s.focusProductRow);
  const focusCell = useCountMe((s) => s.focusCell);
  const pages = useCountMe((s) => s.pages);
  const writePageValue = useCountMe((s) => s.writePageValue);
  const [q, setQ] = useState("");

  if (!parsed) return null;
  const identity = parsed.columns.find((c) => c.kind === "identity");
  const activeColumnId = pages.pageColumns[pages.activePage] ?? null;
  const firstCount =
    parsed.columns.find((c) => c.id === activeColumnId) ??
    parsed.columns.find((c) => c.kind === "count");

  const findRow = () => {
    const term = q.trim().toLocaleLowerCase("tr");
    if (!term) return null;
    return (
      parsed.rows.find((r) =>
        identity ? String(r.cells[identity.id]?.value ?? "").toLocaleLowerCase("tr").includes(term) : false,
      ) ?? parsed.rows.find((r) => String(r.rowNumber) === term) ?? null
    );
  };

  const jump = () => {
    const term = q.trim().toLocaleLowerCase("tr");
    if (!term) return;
    const row =
      parsed.rows.find((r) =>
        identity ? String(r.cells[identity.id]?.value ?? "").toLocaleLowerCase("tr").includes(term) : false,
      ) ?? parsed.rows.find((r) => String(r.rowNumber) === term);
    if (!row) return;
    if (firstCount) focusCell(row.id, firstCount.id);
    else focusProductRow(row.id);
  };

  const randomTarget = () => {
    const row = parsed.rows[Math.floor(Math.random() * parsed.rows.length)];
    if (!row) return;
    if (firstCount) focusCell(row.id, firstCount.id);
    else focusProductRow(row.id);
  };

  return (
    <div className="flex items-center gap-2 border-t border-border bg-card px-2 py-1.5">
      <Search className="size-4 shrink-0 text-muted-foreground" />
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && jump()}
        placeholder="Ürün ara ve hücreye git…"
        className="h-8 min-w-0 flex-1 rounded border border-border bg-background px-2 text-[13px] outline-none focus:ring-2 focus:ring-ring"
      />
      <button
        type="button"
        onClick={jump}
        className="h-8 shrink-0 rounded bg-secondary px-3 text-[13px] font-medium text-secondary-foreground hover:bg-accent"
      >
        Git
      </button>
      <button
        type="button"
        onClick={randomTarget}
        title="focusCell() testi"
        className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded bg-secondary px-3 text-[13px] font-medium text-secondary-foreground hover:bg-accent"
      >
        <Crosshair className="size-4" />
        Odak Testi
      </button>
      <button
        type="button"
        data-testid="system-write-test"
        title="SYSTEM kaynaklı page-aware yazma testi"
        onClick={() => {
          const row = findRow() ?? parsed.rows[0];
          if (row) writePageValue(row.id, pages.activePage, 1, "SYSTEM");
        }}
        className="hidden h-8 shrink-0 items-center gap-1.5 rounded bg-secondary px-3 text-[13px] font-medium text-secondary-foreground hover:bg-accent sm:inline-flex"
      >
        Sistem Yazma
      </button>
    </div>
  );
}