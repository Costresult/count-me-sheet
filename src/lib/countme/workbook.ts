import type { AddedColumn, CellValue, ParsedSheet, SheetCell, SheetColumn, SheetRow } from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyWorkbook = any;

let excelPromise: Promise<AnyWorkbook> | null = null;
export async function getExcelJS(): Promise<AnyWorkbook> {
  if (!excelPromise) {
    excelPromise = import("exceljs").then((m) => (m as never as { default: AnyWorkbook }).default ?? m);
  }
  return excelPromise;
}

export async function loadWorkbook(buffer: ArrayBuffer): Promise<AnyWorkbook> {
  const ExcelJS = await getExcelJS();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer.slice(0));
  return wb;
}

export async function readSheetNames(buffer: ArrayBuffer): Promise<string[]> {
  const wb = await loadWorkbook(buffer);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return wb.worksheets.map((ws: any) => ws.name as string);
}

export const colLetter = (n: number) => {
  let s = "";
  let x = n;
  while (x > 0) {
    const r = (x - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    x = Math.floor((x - 1) / 26);
  }
  return s;
};

const IDENTITY_RE =
  /(ürün|urun|malzeme|stok|isim|ad[ıi]?$|product|item|name|birim|unit|kod|code|barkod|kategori|category|marka|a[çc][ıi]klama|description|depo)/i;
const TOTAL_RE = /(toplam|total|genel\s*toplam|sum|yekun|yek[uû]n)/i;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rawValue(cell: any): { value: CellValue; formula?: string } {
  const v = cell?.value;
  if (v === null || v === undefined) return { value: null };
  if (typeof v === "object") {
    if ("formula" in v || "sharedFormula" in v) {
      const res = (v as { result?: unknown }).result;
      return {
        value: typeof res === "number" || typeof res === "string" ? (res as CellValue) : null,
        formula: (v as { formula?: string }).formula ?? "shared",
      };
    }
    if ("richText" in v) {
      return { value: (v.richText as { text: string }[]).map((t) => t.text).join("") };
    }
    if ("text" in v) return { value: String((v as { text: string }).text) };
    if (v instanceof Date) return { value: v.toLocaleDateString("tr-TR") };
    if ("result" in v) return { value: (v as { result: CellValue }).result ?? null };
    return { value: null };
  }
  if (typeof v === "boolean") return { value: v };
  return { value: v as CellValue };
}

const isBlank = (v: CellValue) => v === null || v === undefined || String(v).trim() === "";

export function parseSheet(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ws: any,
): ParsedSheet {
  const maxCol: number = Math.max(1, ws.actualColumnCount || ws.columnCount || 1);
  const maxRow: number = Math.max(1, ws.actualRowCount || ws.rowCount || 1);

  // --- detect header row: first row (within first 20) with >=2 non-empty text cells
  let headerRowNumber = 1;
  for (let r = 1; r <= Math.min(maxRow, 20); r++) {
    const row = ws.getRow(r);
    let texts = 0;
    for (let c = 1; c <= maxCol; c++) {
      const { value } = rawValue(row.getCell(c));
      if (!isBlank(value) && typeof value === "string") texts++;
    }
    if (texts >= 2) {
      headerRowNumber = r;
      break;
    }
  }

  const headerRow = ws.getRow(headerRowNumber);
  const columns: SheetColumn[] = [];
  for (let c = 1; c <= maxCol; c++) {
    const { value } = rawValue(headerRow.getCell(c));
    const header = isBlank(value) ? colLetter(c) : String(value).trim();
    const col = ws.getColumn(c);
    columns.push({
      id: `c${c}`,
      colNumber: c,
      letter: colLetter(c),
      header,
      kind: "other",
      hidden: Boolean(col?.hidden),
      defaultWidth: 120,
    });
  }

  // --- rows
  const rows: SheetRow[] = [];
  for (let r = headerRowNumber + 1; r <= maxRow; r++) {
    const row = ws.getRow(r);
    const cells: Record<string, SheetCell> = {};
    let hasAny = false;
    for (const col of columns) {
      const cell = row.getCell(col.colNumber);
      const { value, formula } = rawValue(cell);
      if (!isBlank(value) || formula) hasAny = true;
      cells[col.id] = { value, formula, numFmt: cell?.numFmt };
    }
    if (!hasAny) continue;
    rows.push({ id: `r${r}`, rowNumber: r, hidden: Boolean(row.hidden), cells });
  }

  // --- classify columns
  const sample = rows.slice(0, 250);
  for (const col of columns) {
    let numeric = 0;
    let text = 0;
    let filled = 0;
    let formulas = 0;
    for (const row of sample) {
      const cell = row.cells[col.id];
      if (!cell) continue;
      if (cell.formula) formulas++;
      if (isBlank(cell.value)) continue;
      filled++;
      if (typeof cell.value === "number") numeric++;
      else text++;
    }
    const headerIsTotal = TOTAL_RE.test(col.header);
    const mostlyFormula = sample.length > 0 && formulas >= Math.max(2, sample.length * 0.4);
    if (headerIsTotal || mostlyFormula) {
      col.kind = "total";
      col.defaultWidth = 110;
    } else if (IDENTITY_RE.test(col.header) || (filled > 0 && text >= filled * 0.7)) {
      col.kind = "identity";
      col.defaultWidth = /(ürün|urun|malzeme|isim|ad|product|item|name|a[çc][ıi]klama)/i.test(col.header)
        ? 260
        : 110;
    } else {
      col.kind = "count";
      col.defaultWidth = 84;
    }
  }

  // A sheet with no numeric-empty columns still needs entry columns:
  if (!columns.some((c) => c.kind === "count")) {
    for (const col of columns) {
      if (col.kind === "other") col.kind = "count";
    }
  }
  for (const col of columns) if (col.kind === "other") col.kind = "identity";

  return {
    name: ws.name,
    headerRowNumber,
    columns,
    rows,
    mergedCount: Object.keys(ws._merges ?? {}).length,
  };
}

export async function parseWorkbookSheet(buffer: ArrayBuffer, sheetName: string): Promise<ParsedSheet> {
  const wb = await loadWorkbook(buffer);
  const ws = wb.getWorksheet(sheetName);
  if (!ws) throw new Error(`Çalışma sayfası bulunamadı: ${sheetName}`);
  return parseSheet(ws);
}

export interface UnmatchedExportRow {
  name: string;
  unit: string;
  amount: number | null;
  columnId: string | null;
}

/** Applies edits to a fresh copy of the ORIGINAL workbook and returns new xlsx bytes. */
export async function exportWithEdits(
  originalBuffer: ArrayBuffer,
  sheetName: string,
  parsed: ParsedSheet,
  edits: Record<string, number | null>,
  added: AddedColumn[] = [],
  unmatched: UnmatchedExportRow[] = [],
): Promise<{ blob: Blob; warning: string | null }> {
  const wb = await loadWorkbook(originalBuffer);
  const ws = wb.getWorksheet(sheetName);
  if (!ws) throw new Error("Çalışma sayfası bulunamadı");
  const colById = new Map(parsed.columns.map((c) => [c.id, c]));
  const rowById = new Map(parsed.rows.map((r) => [r.id, r]));
  let warning: string | null = null;

  // ---- materialize user-added count columns ----
  const addedIds = new Set(added.map((a) => a.id));
  const realColumns = parsed.columns.filter((c) => !c.virtual);
  const totals = realColumns.filter((c) => c.kind === "total");
  const lastCount = realColumns.filter((c) => c.kind === "count").pop();
  const maxCol = realColumns.reduce((m, c) => Math.max(m, c.colNumber), 1);
  const n = added.length;
  /** original column number where new columns get inserted */
  const shift = new Map<string, number>();

  if (n > 0) {
    const firstTotal = totals[0];
    const insertAt = firstTotal ? firstTotal.colNumber : maxCol + 1;

    // total formulas must be simple contiguous SUM() to stay correct after inserting
    const sumRe = /^SUM\(([A-Z]+)(\d+):([A-Z]+)(\d+)\)$/i;
    let safe = true;
    if (firstTotal) {
      for (const row of parsed.rows) {
        for (const t of totals) {
          const f = row.cells[t.id]?.formula;
          if (f && f !== "shared" && !sumRe.test(f.replace(/\s|\$/g, ""))) safe = false;
        }
      }
    }

    if (firstTotal && !safe) {
      warning =
        "TOPLAM formülleri otomatik güncellenemedi. Yeni sayım kolonları tablonun sonuna eklendi; TOPLAM'a dahil değildir.";
    }

    const insertIndex = firstTotal && safe ? insertAt : maxCol + 1;
    ws.spliceColumns(insertIndex, 0, ...added.map(() => [] as unknown[]));
    added.forEach((a, i) => shift.set(a.id, insertIndex + i));

    const headerRow = ws.getRow(parsed.headerRowNumber);
    added.forEach((a) => {
      headerRow.getCell(shift.get(a.id)!).value = a.header;
    });
    headerRow.commit?.();

    if (firstTotal && safe && lastCount) {
      // widen every simple SUM range that ended at the last count column
      const newEnd = colLetter(lastCount.colNumber + n);
      for (const row of parsed.rows) {
        for (const t of totals) {
          const f = row.cells[t.id]?.formula;
          if (!f || f === "shared") continue;
          const m = sumRe.exec(f.replace(/\s|\$/g, ""));
          if (!m) continue;
          const cell = ws.getRow(row.rowNumber).getCell(t.colNumber + n);
          cell.value = { formula: `SUM(${m[1]}${m[2]}:${newEnd}${m[4]})` };
        }
      }
    }
  }

  const finalCol = (colId: string): number | null => {
    const col = colById.get(colId);
    if (!col) return null;
    if (col.virtual || addedIds.has(colId)) return shift.get(colId) ?? null;
    if (n > 0 && shift.size > 0 && col.colNumber >= Math.min(...Array.from(shift.values()))) {
      return col.colNumber + n;
    }
    return col.colNumber;
  };

  for (const [key, value] of Object.entries(edits)) {
    const [rowId = "", colId = ""] = key.split("|");
    const row = rowById.get(rowId);
    const col = colById.get(colId);
    if (!row || !col || col.kind === "total") continue;
    const colNumber = finalCol(colId);
    if (!colNumber) continue;
    const cell = ws.getRow(row.rowNumber).getCell(colNumber);
    // never overwrite a formula
    if (cell.value && typeof cell.value === "object" && "formula" in cell.value) continue;
    cell.value = value === null ? null : value;
  }

  // ---- unmatched products, appended after the original list ----
  if (unmatched.length > 0) {
    const identity = parsed.columns.filter((c) => c.kind === "identity");
    const nameCol = finalCol(identity[0]?.id ?? parsed.columns[0]!.id) ?? 1;
    const unitCol = identity[1] ? finalCol(identity[1].id) ?? nameCol + 1 : nameCol + 1;
    const lastRow = parsed.rows.reduce((m, r) => Math.max(m, r.rowNumber), parsed.headerRowNumber);
    let r = lastRow + 2; // keep one blank row after the original inventory
    const head = ws.getRow(r);
    head.getCell(nameCol).value = "EŞLEŞMEYEN / LİSTEDE BULUNAMAYAN ÜRÜNLER";
    head.getCell(nameCol).font = { bold: true };
    head.commit?.();
    for (const item of unmatched) {
      r += 1;
      const row = ws.getRow(r);
      row.getCell(nameCol).value = item.name;
      if (item.unit) row.getCell(unitCol).value = item.unit;
      const target = item.columnId ? finalCol(item.columnId) : null;
      if (target && item.amount !== null) row.getCell(target).value = item.amount;
      row.commit?.();
    }
  }

  const out = await wb.xlsx.writeBuffer();
  return {
    blob: new Blob([out], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    warning,
  };
}

/** Returns a parsed sheet extended with the user's added (virtual) count columns. */
export function withAddedColumns(parsed: ParsedSheet | null, added: AddedColumn[]): ParsedSheet | null {
  if (!parsed || added.length === 0) return parsed;
  const existing = new Set(parsed.columns.map((c) => c.id));
  const extras: SheetColumn[] = added
    .filter((a) => !existing.has(a.id))
    .map((a, i) => ({
      id: a.id,
      colNumber: 10000 + i,
      letter: "YENİ",
      header: a.header,
      kind: "count" as const,
      hidden: false,
      defaultWidth: 84,
      virtual: true,
    }));
  if (extras.length === 0) return parsed;
  const firstTotalIdx = parsed.columns.findIndex((c) => c.kind === "total");
  const columns =
    firstTotalIdx === -1
      ? [...parsed.columns, ...extras]
      : [
          ...parsed.columns.slice(0, firstTotalIdx),
          ...extras,
          ...parsed.columns.slice(firstTotalIdx),
        ];
  return { ...parsed, columns };
}