import { ChevronLeft, ChevronRight, Plus, SlidersHorizontal } from "lucide-react";
import { useCountMe } from "@/lib/countme/store";
import { MAX_PAGES, unmappedPages } from "@/lib/countme/pages";
import { cn } from "@/lib/utils";

function PageNav({ compact }: { compact?: boolean }) {
  const pages = useCountMe((s) => s.pages);
  const nextPage = useCountMe((s) => s.nextPage);
  const previousPage = useCountMe((s) => s.previousPage);

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        data-testid="page-prev"
        aria-label="Önceki sayfa"
        onClick={previousPage}
        disabled={pages.activePage <= 1}
        className={cn(
          "inline-flex items-center justify-center rounded-md bg-secondary text-secondary-foreground disabled:opacity-40",
          compact ? "size-11" : "size-8",
        )}
      >
        <ChevronLeft className="size-5" />
      </button>
      <span
        data-testid="active-page"
        className={cn(
          "whitespace-nowrap rounded-md bg-primary/12 px-3 font-bold tabular-nums text-primary",
          compact ? "py-2 text-[15px]" : "py-1 text-[13px]",
        )}
      >
        AKTİF SAYFA: {pages.activePage}
        <span className="ml-1 font-normal text-muted-foreground">/ {pages.pageCount}</span>
      </span>
      <button
        type="button"
        data-testid="page-next"
        aria-label="Sonraki sayfa"
        onClick={nextPage}
        disabled={pages.activePage >= MAX_PAGES}
        className={cn(
          "inline-flex items-center justify-center rounded-md bg-secondary text-secondary-foreground disabled:opacity-40",
          compact ? "size-11" : "size-8",
        )}
      >
        <ChevronRight className="size-5" />
      </button>
    </div>
  );
}

export function PageBar() {
  const parsed = useCountMe((s) => s.parsed);
  const pages = useCountMe((s) => s.pages);
  const setMappingOpen = useCountMe((s) => s.setMappingOpen);
  const feedback = useCountMe((s) => s.pageFeedback);
  const addCountColumn = useCountMe((s) => s.addCountColumn);

  if (!parsed) return null;
  const mappedId = pages.pageColumns[pages.activePage] ?? null;
  const mapped = parsed.columns.find((c) => c.id === mappedId) ?? null;
  const missing = unmappedPages(pages);

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border bg-card px-2 py-1.5">
      <div className="hidden md:block">
        <PageNav />
      </div>
      <span className="text-[12px] text-muted-foreground" data-testid="page-column">
        {mapped ? (
          <>
            Sayım kolonu:{" "}
            <span className="font-semibold text-foreground">
              {mapped.header} ({mapped.letter}){mapped.virtual ? " · yeni" : ""}
            </span>
          </>
        ) : (
          <span className="font-semibold text-destructive">Bu sayfa için sayım kolonu gerekli</span>
        )}
      </span>

      {!mapped && (
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            data-testid="create-count-column"
            onClick={() => addCountColumn()}
            className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-2.5 text-[12px] font-semibold text-primary-foreground"
          >
            <Plus className="size-4" />
            YENİ SAYIM KOLONU OLUŞTUR
          </button>
          <button
            type="button"
            onClick={() => setMappingOpen(true)}
            className="inline-flex h-8 items-center rounded-md bg-secondary px-2.5 text-[12px] font-medium text-secondary-foreground"
          >
            Kolon eşle
          </button>
        </div>
      )}

      <div className="ml-auto flex items-center gap-2">
        <span data-testid="page-count" className="sr-only">
          {pages.pageCount}
        </span>
        <button
          type="button"
          data-testid="open-mapping"
          onClick={() => setMappingOpen(true)}
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[12px] font-medium",
            missing.length > 0
              ? "bg-destructive/15 text-destructive"
              : "bg-secondary text-secondary-foreground hover:bg-accent",
          )}
        >
          <SlidersHorizontal className="size-4" />
          SAYIM KOLONLARINI AYARLA
          {missing.length > 0 && <span>({missing.length})</span>}
        </button>
      </div>

      {feedback && (
        <span
          data-testid="page-feedback"
          role="status"
          className="pointer-events-none fixed left-1/2 top-20 z-50 -translate-x-1/2 rounded-full bg-foreground px-4 py-2 text-[13px] font-semibold text-background shadow-lg"
        >
          {feedback}
        </span>
      )}
    </div>
  );
}

/** Sticky one-tap page switcher for mobile. */
export function MobilePageBar() {
  const parsed = useCountMe((s) => s.parsed);
  if (!parsed) return null;
  return (
    <div className="flex items-center justify-center gap-2 border-t border-border bg-card px-2 py-1.5 md:hidden">
      <PageNav compact />
    </div>
  );
}