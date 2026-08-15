import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { columnWidth, useCountMe } from "@/lib/countme/store";
import { editKey, type SheetColumn, type SheetRow } from "@/lib/countme/types";
import { cn } from "@/lib/utils";

const FROZEN_MAX = 2;

function measureText(text: string, font: string) {
  const canvas = (measureText as unknown as { c?: HTMLCanvasElement }).c ?? document.createElement("canvas");
  (measureText as unknown as { c?: HTMLCanvasElement }).c = canvas;
  const ctx = canvas.getContext("2d");
  if (!ctx) return text.length * 8;
  ctx.font = font;
  return ctx.measureText(text).width;
}

function CellInput({
  rowId,
  col,
  base,
  edited,
  isTarget,
}: {
  rowId: string;
  col: SheetColumn;
  base: string;
  edited: number | null | undefined;
  isTarget: boolean;
}) {
  const write = useCountMe((s) => s.writeInventoryValue);
  const interrupt = useCountMe((s) => s.userInterrupt);
  const external = edited === undefined ? base : edited === null ? "" : String(edited);
  const [draft, setDraft] = useState(external);
  const dirty = useRef(false);

  useEffect(() => {
    if (!dirty.current) setDraft(external);
  }, [external]);

  const commit = () => {
    dirty.current = false;
    const raw = draft.trim().replace(",", ".");
    if (raw === "") {
      if (external !== "") write(rowId, col.id, null);
      return;
    }
    const num = Number(raw);
    if (Number.isNaN(num)) {
      setDraft(external);
      return;
    }
    if (String(num) !== external) write(rowId, col.id, num);
    else setDraft(String(num));
  };

  return (
    <input
      inputMode="decimal"
      className={cn(
        "h-full w-full bg-transparent px-2 text-right text-[13px] tabular-nums outline-none",
        "focus:bg-[var(--grid-edit)] focus:ring-2 focus:ring-inset focus:ring-ring",
        edited !== undefined && "font-semibold text-primary",
        isTarget && "bg-[var(--grid-target)]",
      )}
      value={draft}
      onPointerDown={interrupt}
      onChange={(e) => {
        dirty.current = true;
        setDraft(e.target.value);
      }}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") {
          dirty.current = false;
          setDraft(external);
          (e.target as HTMLInputElement).blur();
        }
      }}
    />
  );
}

export function SheetGrid() {
  const parsed = useCountMe((s) => s.parsed);
  const view = useCountMe((s) => s.view);
  const edits = useCountMe((s) => s.edits);
  const focus = useCountMe((s) => s.focus);
  const clearFocus = useCountMe((s) => s.clearFocus);
  const setColumnWidth = useCountMe((s) => s.setColumnWidth);
  const pages = useCountMe((s) => s.pages);
  const activeColumnId = pages.pageColumns[pages.activePage] ?? null;

  const scrollRef = useRef<HTMLDivElement>(null);
  const [maxFrozen, setMaxFrozen] = useState(FROZEN_MAX);
  const [flash, setFlash] = useState<{ rowId: string; columnId: string | null } | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; col: SheetColumn } | null>(null);

  useEffect(() => {
    const update = () => setMaxFrozen(window.innerWidth >= 700 ? FROZEN_MAX : 1);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  const columns = useMemo(() => parsed?.columns.filter((c) => !c.hidden) ?? [], [parsed]);
  const rows: SheetRow[] = useMemo(() => parsed?.rows.filter((r) => !r.hidden) ?? [], [parsed]);

  const widths = useMemo(() => columns.map((c) => columnWidth(view, c)), [columns, view]);
  const totalWidth = widths.reduce((a, b) => a + b, 0) + 56;

  const identityRun =
    columns.findIndex((c) => c.kind !== "identity") === -1
      ? columns.length
      : columns.findIndex((c) => c.kind !== "identity");
  const frozenCount = Math.max(0, Math.min(maxFrozen, identityRun));

  const leftOffsets = useMemo(() => {
    const out: number[] = [];
    let acc = 56;
    for (let i = 0; i < columns.length; i++) {
      out.push(acc);
      acc += widths[i] ?? 0;
    }
    return out;
  }, [columns, widths]);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => view.rowHeight,
    overscan: 12,
  });

  useEffect(() => {
    virtualizer.measure();
  }, [view.rowHeight, virtualizer]);

  // focus handling: scroll + highlight + fade
  useEffect(() => {
    if (!focus) return;
    const index = rows.findIndex((r) => r.id === focus.rowId);
    if (index < 0) return;
    virtualizer.scrollToIndex(index, { align: "center" });
    if (focus.columnId) {
      const ci = columns.findIndex((c) => c.id === focus.columnId);
      const el = scrollRef.current;
      if (el && ci >= 0) {
        const left = leftOffsets[ci] ?? 0;
        const w = widths[ci] ?? 0;
        const frozenWidth = 56 + widths.slice(0, frozenCount).reduce((a, b) => a + b, 0);
        if (left < el.scrollLeft + frozenWidth) el.scrollLeft = Math.max(0, left - frozenWidth - 8);
        else if (left + w > el.scrollLeft + el.clientWidth)
          el.scrollLeft = left + w - el.clientWidth + 16;
      }
    }
    setFlash({ rowId: focus.rowId, columnId: focus.columnId });
    const token = focus.token;
    const t = setTimeout(() => {
      setFlash(null);
      clearFocus(token);
    }, 1600);
    return () => clearTimeout(t);
  }, [focus, rows, columns, widths, leftOffsets, frozenCount, virtualizer, clearFocus]);

  const autoFit = useCallback(
    (col: SheetColumn) => {
      const font = "13px ui-sans-serif, system-ui, sans-serif";
      let max = measureText(col.header, "600 13px ui-sans-serif, system-ui, sans-serif");
      const limit = Math.min(rows.length, 400);
      for (let i = 0; i < limit; i++) {
        const cell = rows[i]?.cells[col.id];
        const v = cell?.value;
        if (v === null || v === undefined) continue;
        max = Math.max(max, measureText(String(v), font));
      }
      setColumnWidth(col.id, Math.min(420, Math.max(56, max + 28)));
    },
    [rows, setColumnWidth],
  );

  // expose auto-fit for toolbar
  useEffect(() => {
    (window as unknown as { __countmeAutoFitAll?: () => void }).__countmeAutoFitAll = () => {
      columns.forEach(autoFit);
    };
    return () => {
      delete (window as unknown as { __countmeAutoFitAll?: () => void }).__countmeAutoFitAll;
    };
  }, [columns, autoFit]);

  const startResize = (col: SheetColumn, startX: number, startWidth: number) => {
    const move = (e: PointerEvent) => setColumnWidth(col.id, startWidth + (e.clientX - startX));
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  if (!parsed) return null;

  const items = virtualizer.getVirtualItems();

  return (
    <div
      ref={scrollRef}
      className="relative h-full w-full overflow-auto overscroll-contain bg-card"
      onScroll={() => menu && setMenu(null)}
    >
      <div style={{ width: totalWidth, minWidth: "100%" }} className="relative">
        {/* header */}
        <div className="sticky top-0 z-30 flex h-10 border-b border-border bg-[var(--grid-header)]">
          <div className="sticky left-0 z-10 flex w-14 shrink-0 items-center justify-center border-r border-border bg-[var(--grid-header)] text-[11px] text-muted-foreground">
            #
          </div>
          {columns.map((col, i) => (
            <div
              key={col.id}
              style={{
                width: widths[i],
                ...(i < frozenCount
                  ? { position: "sticky" as const, left: leftOffsets[i], zIndex: 10 }
                  : {}),
              }}
              className={cn(
                "group relative flex shrink-0 items-center border-r border-border bg-[var(--grid-header)] px-2",
                col.kind === "total" && "bg-[var(--grid-total-header)]",
                col.id === activeColumnId && "bg-primary/15 ring-1 ring-inset ring-primary/40",
              )}
              onDoubleClick={() => autoFit(col)}
              onContextMenu={(e) => {
                e.preventDefault();
                setMenu({ x: e.clientX, y: e.clientY, col });
              }}
              title={`${col.header} (${col.letter})`}
            >
              <span className="truncate text-[12px] font-semibold text-foreground">{col.header}</span>
              {col.id === activeColumnId && (
                <span className="ml-1 shrink-0 rounded bg-primary px-1 text-[9px] font-bold uppercase text-primary-foreground">
                  s{pages.activePage}
                </span>
              )}
              {col.kind === "total" && (
                <span className="ml-1 shrink-0 rounded bg-secondary px-1 text-[9px] uppercase text-muted-foreground">
                  hesap
                </span>
              )}
              <div
                role="separator"
                aria-label={`${col.header} kolon genişliği`}
                onPointerDown={(e) => {
                  e.preventDefault();
                  startResize(col, e.clientX, widths[i] ?? col.defaultWidth);
                }}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  autoFit(col);
                }}
                className="absolute right-0 top-0 h-full w-3 translate-x-1/2 cursor-col-resize touch-none bg-transparent hover:bg-primary/30"
              />
            </div>
          ))}
        </div>

        {/* body */}
        <div style={{ height: virtualizer.getTotalSize() }} className="relative">
          {items.map((vi) => {
            const row = rows[vi.index]!;
            const rowFlash = flash?.rowId === row.id;
            return (
              <div
                key={row.id}
                data-row-id={row.id}
                className={cn(
                  "absolute left-0 flex border-b border-border/70",
                  vi.index % 2 === 1 && "bg-[var(--grid-stripe)]",
                  rowFlash && "bg-[var(--grid-row-flash)] transition-colors duration-500",
                )}
                style={{
                  top: 0,
                  height: view.rowHeight,
                  width: totalWidth,
                  transform: `translateY(${vi.start}px)`,
                }}
              >
                <div
                  className={cn(
                    "sticky left-0 z-10 flex w-14 shrink-0 items-center justify-center border-r border-border bg-card text-[11px] text-muted-foreground",
                    vi.index % 2 === 1 && "bg-[var(--grid-stripe-solid)]",
                    rowFlash && "bg-[var(--grid-row-flash-solid)]",
                  )}
                >
                  {row.rowNumber}
                </div>
                {columns.map((col, i) => {
                  const cell = row.cells[col.id];
                  const isEditable = col.kind === "count" && !cell?.formula;
                  const edited = edits[editKey(row.id, col.id)];
                  const base =
                    cell?.value === null || cell?.value === undefined ? "" : String(cell.value);
                  const isTarget = rowFlash && flash?.columnId === col.id;
                  return (
                    <div
                      key={col.id}
                      style={{
                        width: widths[i],
                        ...(i < frozenCount
                          ? { position: "sticky" as const, left: leftOffsets[i], zIndex: 5 }
                          : {}),
                      }}
                      className={cn(
                        "flex shrink-0 items-center overflow-hidden border-r border-border/70",
                        i < frozenCount && "bg-card",
                        i < frozenCount && vi.index % 2 === 1 && "bg-[var(--grid-stripe-solid)]",
                        i < frozenCount && rowFlash && "bg-[var(--grid-row-flash-solid)]",
                        col.kind === "total" && "bg-[var(--grid-total)] justify-end",
                        col.id === activeColumnId && "bg-primary/8",
                        isTarget && "ring-2 ring-inset ring-primary",
                      )}
                    >
                      {isEditable ? (
                        <CellInput
                          rowId={row.id}
                          col={col}
                          base={base}
                          edited={edited}
                          isTarget={Boolean(isTarget)}
                        />
                      ) : (
                        <span
                          className={cn(
                            "truncate px-2 text-[13px]",
                            col.kind === "identity" ? "text-foreground" : "w-full text-right tabular-nums text-muted-foreground",
                            cell?.formula && "italic",
                          )}
                          title={base}
                        >
                          {base}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      {menu && (
        <>
          <div className="fixed inset-0 z-50" onPointerDown={() => setMenu(null)} />
          <div
            className="fixed z-50 w-56 overflow-hidden rounded-md border border-border bg-popover py-1 shadow-lg"
            style={{ left: menu.x, top: menu.y }}
          >
            <button
              type="button"
              className="block w-full px-3 py-2 text-left text-[13px] hover:bg-secondary"
              onClick={() => {
                autoFit(menu.col);
                setMenu(null);
              }}
            >
              Kolonu Otomatik Sığdır
            </button>
            <button
              type="button"
              className="block w-full px-3 py-2 text-left text-[13px] hover:bg-secondary"
              onClick={() => {
                columns.forEach(autoFit);
                setMenu(null);
              }}
            >
              Tüm Kolonları Sığdır
            </button>
            <button
              type="button"
              className="block w-full px-3 py-2 text-left text-[13px] hover:bg-secondary"
              onClick={() => {
                useCountMe.getState().resetView();
                setMenu(null);
              }}
            >
              Görünümü Sıfırla
            </button>
          </div>
        </>
      )}
    </div>
  );
}