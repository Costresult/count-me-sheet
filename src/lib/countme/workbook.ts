import type { CellValue, ParsedSheet, SheetCell, SheetColumn, SheetRow } from "./types";

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

const colLetter = (n: number) => {
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

/** Applies edits to a fresh copy of the ORIGINAL workbook and returns new xlsx bytes. */
export async function exportWithEdits(
  originalBuffer: ArrayBuffer,
  sheetName: string,
  parsed: ParsedSheet,
  edits: Record<string, number | null>,
): Promise<Blob> {
  const wb = await loadWorkbook(originalBuffer);
  const ws = wb.getWorksheet(sheetName);
  if (!ws) throw new Error("Çalışma sayfası bulunamadı");
  const colById = new Map(parsed.columns.map((c) => [c.id, c]));
  const rowById = new Map(parsed.rows.map((r) => [r.id, r]));

  for (const [key, value] of Object.entries(edits)) {
    const [rowId, colId] = key.split("|");
    const row = rowById.get(rowId);
    const col = colById.get(colId);
    if (!row || !col || col.kind === "total") continue;
    const cell = ws.getRow(row.rowNumber).getCell(col.colNumber);
    // never overwrite a formula
    if (cell.value && typeof cell.value === "object" && "formula" in cell.value) continue;
    cell.value = value === null ? null : value;
  }

  const out = await wb.xlsx.writeBuffer();
  return new Blob([out], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}