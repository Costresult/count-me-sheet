import type { PageState, ParsedSheet, SheetRow } from "./types";
import { editKey } from "./types";

/** Parses user input allowing Turkish decimal comma. Returns null for empty, NaN-safe. */
export function parseNumericInput(raw: string): number | null | undefined {
  const t = raw.trim().replace(/\s/g, "").replace(",", ".");
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
}

/** Count columns that feed the live total: every column mapped to a physical page, else all count columns. */
export function totalSourceColumnIds(parsed: ParsedSheet | null, pages: PageState): string[] {
  if (!parsed) return [];
  const byId = new Map(parsed.columns.map((c) => [c.id, c]));
  const mapped: string[] = [];
  for (let p = 1; p <= pages.pageCount; p++) {
    const id = pages.pageColumns[p];
    const col = id ? byId.get(id) : null;
    if (col && col.kind === "count" && !mapped.includes(col.id)) mapped.push(col.id);
  }
  if (mapped.length > 0) return mapped;
  return parsed.columns.filter((c) => c.kind === "count").map((c) => c.id);
}

const numberOf = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

/** Live total of one row over the given count columns (edits win over the original cell value). */
export function liveRowTotal(
  row: SheetRow,
  columnIds: string[],
  edits: Record<string, number | null>,
): number | null {
  let sum = 0;
  let any = false;
  for (const colId of columnIds) {
    const key = editKey(row.id, colId);
    const edited = edits[key];
    const value = edited === undefined ? numberOf(row.cells[colId]?.value) : edited;
    if (value === null || value === undefined) continue;
    any = true;
    sum += value;
  }
  if (!any) return null;
  return Math.round(sum * 1e6) / 1e6;
}

export const formatTotal = (n: number | null): string =>
  n === null ? "" : String(Math.round(n * 1e6) / 1e6);
