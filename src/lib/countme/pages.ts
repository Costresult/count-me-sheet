import type { PageState, ParsedSheet, SheetColumn } from "./types";
import { emptyPages } from "./types";

export const MAX_PAGES = 40;

/** Excel columns that may serve as a physical counting page. TOTAL is never eligible. */
export function eligibleCountColumns(parsed: ParsedSheet | null): SheetColumn[] {
  if (!parsed) return [];
  return parsed.columns.filter((c) => c.kind === "count" && !c.hidden);
}

/** Builds (or repairs) the page mapping for a sheet, keeping any valid stored mapping. */
export function derivePages(parsed: ParsedSheet | null, stored?: PageState | undefined): PageState {
  const cols = eligibleCountColumns(parsed);
  if (cols.length === 0 && !stored) return emptyPages();

  const valid = new Set(cols.map((c) => c.id));
  const pageColumns: Record<number, string | null> = {};
  const used = new Set<string>();

  const storedCount = stored?.pageCount ?? 0;
  const suggested = Math.max(1, Math.min(MAX_PAGES, cols.length || 1));
  const pageCount = Math.max(1, Math.min(MAX_PAGES, storedCount || suggested));

  // keep stored mapping when the column still exists and is not duplicated
  for (let p = 1; p <= pageCount; p++) {
    const kept = stored?.pageColumns?.[p];
    if (kept && valid.has(kept) && !used.has(kept)) {
      pageColumns[p] = kept;
      used.add(kept);
    }
  }
  // fill the rest in sheet order with unused count columns
  for (let p = 1; p <= pageCount; p++) {
    if (pageColumns[p]) continue;
    if (stored?.pageColumns && p in stored.pageColumns && stored.pageColumns[p] === null) {
      pageColumns[p] = null;
      continue;
    }
    const next = cols.find((c) => !used.has(c.id));
    if (next) {
      pageColumns[p] = next.id;
      used.add(next.id);
    } else {
      pageColumns[p] = null;
    }
  }

  const activePage = Math.min(Math.max(1, stored?.activePage ?? 1), pageCount);
  return { activePage, pageCount, pageColumns, lastActiveRow: stored?.lastActiveRow ?? null };
}

export const pageColumnId = (pages: PageState, page: number): string | null =>
  pages.pageColumns[page] ?? null;

export const unmappedPages = (pages: PageState): number[] => {
  const out: number[] = [];
  for (let p = 1; p <= pages.pageCount; p++) if (!pages.pageColumns[p]) out.push(p);
  return out;
};