import type { ParsedUtterance, SpokenTerm } from "./parser";
import type { ProductRow } from "./productIndex";
import { familyOf, toCl, toGram, type UnitCode } from "./units";

export interface ResolvedWrite {
  rowId: string;
  value: number;
  note: string;
}

export interface UnitResolution {
  writes: ResolvedWrite[];
  /** rows the user must choose between when the destination is unclear */
  ambiguousRows: ProductRow[] | null;
  reason: string;
}

const round = (n: number) => Math.round(n * 1e6) / 1e6;

const COUNT_UNITS: UnitCode[] = ["ADET", "SISE", "KOLI", "PAKET", "FICI"];

const rowsWithUnit = (rows: ProductRow[], unit: UnitCode) =>
  rows.filter((r) => r.unitInfo.unit === unit);

function pickBottleRow(rows: ProductRow[], sizeCl: number | null): ProductRow | null {
  const bottles = rowsWithUnit(rows, "SISE");
  if (bottles.length === 0) return null;
  if (sizeCl !== null) {
    const exact = bottles.find((b) => b.unitInfo.sizeCl === sizeCl);
    if (exact) return exact;
  }
  return bottles.length === 1 ? bottles[0]! : null;
}

/** Decides which row of a product gets which number for one spoken term. */
function resolveTerm(
  rows: ProductRow[],
  term: SpokenTerm,
  bottleSizeCl: number | null,
): ResolvedWrite | { ambiguous: ProductRow[] } | null {
  const single = rows.length === 1 ? rows[0]! : null;
  const unit = term.unit;

  if (unit && familyOf(unit) === "weight") {
    const grams = toGram(term.quantity, unit);
    const exact = rowsWithUnit(rows, unit)[0];
    if (exact) return { rowId: exact.rowId, value: round(term.quantity), note: `${unit}` };
    const gramRow = rowsWithUnit(rows, "GRAM")[0];
    if (gramRow) return { rowId: gramRow.rowId, value: round(grams), note: "gram" };
    const kgRow = rowsWithUnit(rows, "KG")[0];
    if (kgRow) return { rowId: kgRow.rowId, value: round(grams / 1000), note: "gram→kg" };
    if (single) return { rowId: single.rowId, value: round(term.quantity), note: "tek satır" };
    return { ambiguous: rows };
  }

  if (unit && familyOf(unit) === "volume") {
    const cl = toCl(term.quantity, unit);
    const litreRow = rowsWithUnit(rows, "L")[0];
    const clRow = rowsWithUnit(rows, "CL")[0];
    if (unit === "CL" && clRow) return { rowId: clRow.rowId, value: round(cl), note: "cl" };
    if (litreRow) return { rowId: litreRow.rowId, value: round(cl / 100), note: "cl→litre" };
    if (clRow) return { rowId: clRow.rowId, value: round(cl), note: "cl" };
    const bottle = pickBottleRow(rows, bottleSizeCl);
    if (bottle && bottle.unitInfo.sizeCl)
      return {
        rowId: bottle.rowId,
        value: round(cl / bottle.unitInfo.sizeCl),
        note: `${bottle.unitInfo.sizeCl} cl şişe`,
      };
    if (single) return { rowId: single.rowId, value: round(cl / 100), note: "litre varsayımı" };
    return { ambiguous: rows };
  }

  if (unit && COUNT_UNITS.includes(unit)) {
    if (unit === "SISE") {
      const bottle = pickBottleRow(rows, bottleSizeCl);
      if (bottle) return { rowId: bottle.rowId, value: round(term.quantity), note: "şişe" };
      const adet = rowsWithUnit(rows, "ADET")[0];
      if (adet) return { rowId: adet.rowId, value: round(term.quantity), note: "şişe→adet" };
      if (rowsWithUnit(rows, "SISE").length > 1) return { ambiguous: rowsWithUnit(rows, "SISE") };
    } else {
      const exact = rowsWithUnit(rows, unit)[0];
      if (exact) return { rowId: exact.rowId, value: round(term.quantity), note: unit };
      if (unit === "ADET") {
        const bottle = pickBottleRow(rows, bottleSizeCl);
        if (bottle) return { rowId: bottle.rowId, value: round(term.quantity), note: "adet→şişe" };
      }
    }
    if (single) return { rowId: single.rowId, value: round(term.quantity), note: "tek satır" };
    return { ambiguous: rows };
  }

  // no spoken unit
  if (single) {
    const info = single.unitInfo;
    if (info.unit === "CL" && term.quantity < 10) {
      return { rowId: single.rowId, value: round(term.quantity * 100), note: "litre→cl" };
    }
    return { rowId: single.rowId, value: round(term.quantity), note: "birimsiz" };
  }
  if (bottleSizeCl !== null) {
    const bottle = pickBottleRow(rows, bottleSizeCl);
    if (bottle) return { rowId: bottle.rowId, value: round(term.quantity), note: "şişe boyu" };
  }
  const litreRow = rowsWithUnit(rows, "L")[0];
  if (litreRow && rows.length > 1 && term.quantity < 10)
    return { rowId: litreRow.rowId, value: round(term.quantity), note: "litre" };
  return { ambiguous: rows };
}

/** Maps a parsed utterance onto concrete row/value writes for one product group. */
export function resolveUnitDestination(rows: ProductRow[], u: ParsedUtterance): UnitResolution {
  if (rows.length === 0) return { writes: [], ambiguousRows: null, reason: "satır yok" };
  const terms = u.terms;
  if (terms.length === 0) return { writes: [], ambiguousRows: null, reason: "miktar yok" };

  if (u.operation === "multiply" && terms.length >= 2) {
    const [a, b] = [terms[0]!, terms[1]!];
    const pkgTerm = b.unit && (b.unit === "KOLI" || b.unit === "PAKET") ? b : a;
    const perTerm = pkgTerm === b ? a : b;
    const pkgRow =
      pkgTerm.unit ? rows.filter((r) => r.unitInfo.unit === pkgTerm.unit) : [];
    const exactPkg = pkgRow.find(
      (r) => r.unitInfo.perPackage === null || r.unitInfo.perPackage === perTerm.quantity,
    );
    if (exactPkg) {
      return {
        writes: [{ rowId: exactPkg.rowId, value: round(pkgTerm.quantity), note: "koli adedi" }],
        ambiguousRows: null,
        reason: "paket satırı",
      };
    }
    const total = round(a.quantity * b.quantity);
    const res = resolveTerm(rows, { quantity: total, unit: "ADET", spokenUnit: "adet" }, u.bottleSizeCl);
    if (res && "rowId" in res) return { writes: [res], ambiguousRows: null, reason: "çarpım" };
    return { writes: [], ambiguousRows: rows, reason: "belirsiz" };
  }

  if (u.operation === "plus" && terms.length >= 2) {
    const families = new Set(terms.map((t) => (t.unit ? familyOf(t.unit) : "none")));
    const allVolume = families.size === 1 && families.has("volume");
    const allWeight = families.size === 1 && families.has("weight");
    if (allVolume || allWeight) {
      const totalBase = terms.reduce(
        (acc, t) => acc + (allVolume ? toCl(t.quantity, t.unit!) : toGram(t.quantity, t.unit!)),
        0,
      );
      const merged: SpokenTerm = allVolume
        ? { quantity: round(totalBase), unit: "CL", spokenUnit: "cl" }
        : { quantity: round(totalBase), unit: "GRAM", spokenUnit: "gram" };
      const res = resolveTerm(rows, merged, u.bottleSizeCl);
      if (res && "rowId" in res) return { writes: [res], ambiguousRows: null, reason: "toplandı" };
      return { writes: [], ambiguousRows: rows, reason: "belirsiz" };
    }
    // different destination units: write each term to its own row
    const writes: ResolvedWrite[] = [];
    for (const t of terms) {
      const res = resolveTerm(rows, t, u.bottleSizeCl);
      if (!res) continue;
      if ("ambiguous" in res) return { writes: [], ambiguousRows: res.ambiguous, reason: "belirsiz" };
      const dup = writes.find((w) => w.rowId === res.rowId);
      if (dup) dup.value = round(dup.value + res.value);
      else writes.push(res);
    }
    return { writes, ambiguousRows: null, reason: "ayrı birimler" };
  }

  const res = resolveTerm(rows, terms[0]!, u.bottleSizeCl);
  if (!res) return { writes: [], ambiguousRows: rows, reason: "belirsiz" };
  if ("ambiguous" in res) return { writes: [], ambiguousRows: res.ambiguous, reason: "belirsiz" };
  return { writes: [res], ambiguousRows: null, reason: res.note };
}
