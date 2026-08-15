import type { ParsedSheet, SheetRow } from "@/lib/countme/types";
import { normalizeText, phoneticKey, tokenize } from "./text";
import { detectRowUnit, type RowUnitInfo } from "./units";

export interface ProductRow {
  rowId: string;
  rowNumber: number;
  name: string;
  unitText: string;
  label: string;
  norm: string;
  tokens: string[];
  phon: string;
  unitInfo: RowUnitInfo;
  /** normalized product name with unit words removed – groups the rows of one product */
  groupKey: string;
}

const UNIT_HEADER_RE = /(birim|unit|[oö]l[cç][uü]|miktar\s*birim|ambalaj)/i;
const UNIT_WORD_RE =
  /\b(sise|adet|koli|paket|fici|gram|gr|kg|kilo|cl|ml|lt|l|litre|kasa|varil|keg)\b|\b\d+(?:[.,]\d+)?\s*(cl|ml|lt|l|gr|gram|kg)\b/g;

const textValue = (row: SheetRow, colId: string): string => {
  const v = row.cells[colId]?.value;
  return v === null || v === undefined ? "" : String(v).trim();
};

/** Builds the searchable product catalogue from the active sheet. */
export function buildProductIndex(parsed: ParsedSheet | null): ProductRow[] {
  if (!parsed) return [];
  const textCols = parsed.columns.filter((c) => c.kind === "identity" || c.kind === "other");
  if (textCols.length === 0) return [];

  const stats = textCols.map((c) => {
    let len = 0;
    let filled = 0;
    for (const r of parsed.rows) {
      const v = textValue(r, c.id);
      if (!v || /^\d+([.,]\d+)?$/.test(v)) continue;
      filled++;
      len += v.length;
    }
    return { col: c, filled, avg: filled ? len / filled : 0 };
  });

  const nameStat = [...stats].sort((a, b) => b.avg * b.filled - a.avg * a.filled)[0];
  if (!nameStat || nameStat.filled === 0) return [];
  const nameCol = nameStat.col;
  const unitCols = textCols.filter(
    (c) =>
      c.id !== nameCol.id &&
      (UNIT_HEADER_RE.test(c.header) ||
        parsed.rows.slice(0, 60).some((r) => {
          const v = normalizeText(textValue(r, c.id));
          return v.length > 0 && v.length <= 14 && UNIT_WORD_RE.test(` ${v} `);
        })),
  );

  const out: ProductRow[] = [];
  for (const row of parsed.rows) {
    if (row.hidden) continue;
    const name = textValue(row, nameCol.id);
    if (!name || /^\d+([.,]\d+)?$/.test(name)) continue;
    const unitText = unitCols.map((c) => textValue(row, c.id)).filter(Boolean).join(" ");
    const label = unitText ? `${name} | ${unitText}` : name;
    const norm = normalizeText(`${name} ${unitText}`);
    const nameNorm = normalizeText(name);
    const groupKey = nameNorm.replace(UNIT_WORD_RE, " ").replace(/\s+/g, " ").trim() || nameNorm;
    out.push({
      rowId: row.id,
      rowNumber: row.rowNumber,
      name,
      unitText,
      label,
      norm,
      tokens: tokenize(`${name} ${unitText}`),
      phon: phoneticKey(name),
      unitInfo: detectRowUnit(normalizeText(`${unitText} ${name}`)),
      groupKey,
    });
  }
  return out;
}
