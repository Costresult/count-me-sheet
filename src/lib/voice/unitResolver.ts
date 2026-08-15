import type { ParsedUtterance, SpokenTerm } from "./parser";
import type { ProductRow } from "./productIndex";
import { familyOf, toCl, toGram, type RowUnitInfo, type UnitCode } from "./units";

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

/**
 * FINAL WRITE GATE.
 * Converts a spoken quantity into the number that must land in the target
 * row's cell. Every VOICE_AI write goes through this, so an earlier stage that
 * lost the unit (e.g. an option built from the raw quantity) can never write
 * "35" into a LİTRE row.
 */
export function normalizeForTargetUnit(
  quantity: number,
  sourceUnit: UnitCode | null,
  target: RowUnitInfo,
): { value: number; note: string } {
  const t = target.unit;
  if (!sourceUnit || !t) return { value: round(quantity), note: "birimsiz" };
  if (sourceUnit === t) return { value: round(quantity), note: t };

  const src = familyOf(sourceUnit);
  const dst = familyOf(t);

  if (src === "volume" && dst === "volume") {
    const cl = toCl(quantity, sourceUnit);
    return t === "L" ? { value: round(cl / 100), note: "cl→litre" } : { value: round(cl), note: "litre→cl" };
  }
  if (src === "weight" && dst === "weight") {
    const g = toGram(quantity, sourceUnit);
    return t === "KG" ? { value: round(g / 1000), note: "gram→kg" } : { value: round(g), note: "kg→gram" };
  }
  // spoken volume/weight landing on a sized package row → number of packages
  if (src === "volume" && dst === "count" && target.sizeCl) {
    return { value: round(toCl(quantity, sourceUnit) / target.sizeCl), note: `${target.sizeCl} cl paket` };
  }
  if (src === "weight" && dst === "count" && target.sizeGr) {
    return { value: round(toGram(quantity, sourceUnit) / target.sizeGr), note: `${target.sizeGr} gr paket` };
  }
  return { value: round(quantity), note: `${sourceUnit}→${t}` };
}

export type UnitConfidence = "HIGH" | "MEDIUM" | "LOW";

export interface DestinationOption {
  row: ProductRow;
  value: number;
  note: string;
}

export interface Destination {
  writes: ResolvedWrite[];
  confidence: UnitConfidence;
  options: DestinationOption[];
  reason: string;
}

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

/* ------------------------------------------------------------------ *
 * Strict destination resolution.
 * Product identity is NEVER enough: the unit / package row must also be
 * unambiguous, otherwise the caller has to ask the user.
 * ------------------------------------------------------------------ */

type Kind = "exact" | "package" | "convert" | "weak";

const near = (a: number, b: number) => Math.abs(a - b) < 1e-6;

function classify(
  row: ProductRow,
  term: SpokenTerm,
): { kind: Kind; value: number; note: string } | null {
  const info = row.unitInfo;
  const unit = term.unit;
  const q = term.quantity;

  if (!unit) {
    // no spoken unit: nothing is a strong signal
    return { kind: "weak", value: round(q), note: info.unit ? unitLabelNote(info.unit) : "birimsiz" };
  }

  // package/size interpretation: "25 gram" -> one "PAKET 25 GR".
  // Only rows counted in packages/bottles can absorb this reading; a KILOGRAM
  // row is a real weight row even when its name mentions a package size.
  const fam = familyOf(unit);
  const packageRow = info.unit !== null && familyOf(info.unit) === "count";
  if (packageRow && fam === "weight" && info.sizeGr !== null && near(toGram(q, unit), info.sizeGr)) {
    return { kind: "package", value: 1, note: `1 × ${info.sizeGr} gr paket` };
  }
  if (packageRow && fam === "volume" && info.sizeCl !== null && near(toCl(q, unit), info.sizeCl)) {
    return { kind: "package", value: 1, note: `1 × ${info.sizeCl} cl` };
  }

  if (info.unit === unit) return { kind: "exact", value: round(q), note: unitLabelNote(unit) };

  if (info.unit && familyOf(info.unit) === fam) {
    if (fam === "weight") {
      const g = toGram(q, unit);
      return info.unit === "KG"
        ? { kind: "convert", value: round(g / 1000), note: "gram→kg" }
        : { kind: "convert", value: round(g), note: "kg→gram" };
    }
    if (fam === "volume") {
      const cl = toCl(q, unit);
      return info.unit === "L"
        ? { kind: "convert", value: round(cl / 100), note: "cl→litre" }
        : { kind: "convert", value: round(cl), note: "litre→cl" };
    }
    return { kind: "convert", value: round(q), note: unitLabelNote(info.unit) };
  }

  // a spoken count unit landing on a sized bottle row of the right shape
  if (unit === "SISE" && info.unit === "SISE") return { kind: "exact", value: round(q), note: "şişe" };
  if (unit === "ADET" && info.unit === "SISE" && info.sizeCl !== null)
    return { kind: "weak", value: round(q), note: "adet→şişe" };

  return null;
}

function unitLabelNote(u: UnitCode): string {
  return u;
}

/** Resolves where a single-term utterance must be written, with confidence. */
export function resolveDestination(rows: ProductRow[], u: ParsedUtterance): Destination {
  if (rows.length === 0) return { writes: [], confidence: "LOW", options: [], reason: "satır yok" };
  if (u.terms.length === 0)
    return { writes: [], confidence: "LOW", options: [], reason: "miktar yok" };

  if (u.operation !== "single" || u.terms.length > 1) {
    const legacy = resolveUnitDestination(rows, u);
    if (legacy.writes.length > 0)
      return { writes: legacy.writes, confidence: "HIGH", options: [], reason: legacy.reason };
    const opts = (legacy.ambiguousRows ?? rows).map((r) => ({
      row: r,
      value: round(u.terms[0]!.quantity),
      note: r.unitText || "",
    }));
    return { writes: [], confidence: "LOW", options: opts, reason: legacy.reason };
  }

  const term = u.terms[0]!;
  const scored = rows
    .map((r) => {
      const c = classify(r, term);
      return c ? { row: r, ...c } : null;
    })
    .filter((x): x is { row: ProductRow; kind: Kind; value: number; note: string } => x !== null);

  const exact = scored.filter((s) => s.kind === "exact");
  const pack = scored.filter((s) => s.kind === "package");
  const conv = scored.filter((s) => s.kind === "convert");

  const asOptions = (list: typeof scored) =>
    list.map((s) => ({ row: s.row, value: s.value, note: s.note }));

  // single candidate row overall: the destination cannot be mistaken
  if (rows.length === 1 && scored.length === 1) {
    const s = scored[0]!;
    return {
      writes: [{ rowId: s.row.rowId, value: s.value, note: s.note }],
      confidence: "HIGH",
      options: [],
      reason: s.note,
    };
  }

  if (exact.length === 1 && pack.length === 0) {
    const s = exact[0]!;
    return {
      writes: [{ rowId: s.row.rowId, value: s.value, note: s.note }],
      confidence: "HIGH",
      options: [],
      reason: s.note,
    };
  }

  if (pack.length === 1 && exact.length === 0 && conv.length === 0) {
    const s = pack[0]!;
    return {
      writes: [{ rowId: s.row.rowId, value: s.value, note: s.note }],
      confidence: "HIGH",
      options: [],
      reason: s.note,
    };
  }

  if (exact.length === 0 && pack.length === 0 && conv.length === 1) {
    const s = conv[0]!;
    return {
      writes: [{ rowId: s.row.rowId, value: s.value, note: s.note }],
      confidence: "HIGH",
      options: [],
      reason: s.note,
    };
  }

  const strong = [...exact, ...pack, ...conv];
  const options = strong.length > 0 ? asOptions(strong) : asOptions(scored);
  const fallback =
    options.length > 0
      ? options
      : rows.map((r) => ({ row: r, value: round(term.quantity), note: r.unitText || "" }));
  return {
    writes: [],
    confidence: strong.length > 0 ? "MEDIUM" : "LOW",
    options: fallback.slice(0, 6),
    reason: "birim belirsiz",
  };
}
