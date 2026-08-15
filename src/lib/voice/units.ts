/** Spoken and sheet unit vocabulary + conversions. */

export type UnitCode = "ADET" | "SISE" | "KOLI" | "PAKET" | "FICI" | "GRAM" | "KG" | "CL" | "L";

export type UnitFamily = "count" | "weight" | "volume";

const VARIANTS: Record<string, UnitCode> = {
  adet: "ADET", ad: "ADET", tane: "ADET", pcs: "ADET", piece: "ADET",
  sise: "SISE", sisesi: "SISE", siseden: "SISE", bottle: "SISE", sis: "SISE",
  koli: "KOLI", kolisi: "KOLI", kasa: "KOLI", case: "KOLI",
  paket: "PAKET", pkt: "PAKET", pack: "PAKET",
  fici: "FICI", varil: "FICI", keg: "FICI",
  gram: "GRAM", gr: "GRAM", g: "GRAM", grami: "GRAM",
  kg: "KG", kilo: "KG", kilogram: "KG", kilograms: "KG", kgs: "KG",
  cl: "CL", santilitre: "CL", cc: "CL",
  l: "L", lt: "L", litre: "L", liter: "L", lit: "L", ltr: "L",
  ml: "CL", // handled with a factor below
};

export const MILLILITRE_TOKENS = new Set(["ml", "mililitre"]);

export const unitFromToken = (token: string): UnitCode | null => VARIANTS[token] ?? null;

export const isUnitToken = (token: string): boolean => token in VARIANTS;

export const familyOf = (u: UnitCode): UnitFamily =>
  u === "GRAM" || u === "KG" ? "weight" : u === "CL" || u === "L" ? "volume" : "count";

/** Volume in centilitres. */
export const toCl = (value: number, unit: UnitCode): number =>
  unit === "L" ? value * 100 : value;

/** Weight in grams. */
export const toGram = (value: number, unit: UnitCode): number =>
  unit === "KG" ? value * 1000 : value;

export const unitLabel: Record<UnitCode, string> = {
  ADET: "ADET",
  SISE: "ŞİŞE",
  KOLI: "KOLİ",
  PAKET: "PAKET",
  FICI: "FIÇI",
  GRAM: "GRAM",
  KG: "KG",
  CL: "CL",
  L: "LİTRE",
};

/** Detects the unit described by an inventory row's unit/name text. */
export interface RowUnitInfo {
  unit: UnitCode | null;
  /** bottle/package size in CL when the row states one (ŞİŞE 70 CL). */
  sizeCl: number | null;
  /** package size in grams when the row states one (PAKET 25 GR). */
  sizeGr: number | null;
  /** units per package for KOLİ 24 ADET style rows. */
  perPackage: number | null;
}

function unitCodeOf(t: string): UnitCode | null {
  if (/\bkoli\b|\bkasa\b/.test(t)) return "KOLI";
  if (/\bsise\b|\bbottle\b/.test(t)) return "SISE";
  if (/\bpaket\b/.test(t)) return "PAKET";
  if (/\bfici\b|\bvaril\b|\bkeg\b/.test(t)) return "FICI";
  // kilogram must win over the "gram" substring test
  if (/\bkg\b|kilogram|\bkilo\b/.test(t)) return "KG";
  if (/\bgram\b|\bgr\b/.test(t)) return "GRAM";
  if (/\bcl\b|santilitre/.test(t)) return "CL";
  if (/\blitre\b|\bliter\b|\blt\b|\bl\b/.test(t)) return "L";
  if (/\badet\b|\btane\b/.test(t)) return "ADET";
  return null;
}

function sizes(t: string): { cl: number | null; gr: number | null; lt: number | null } {
  const num = (m: RegExpExecArray | null) => (m ? Number(m[1]!.replace(",", ".")) : null);
  const cl = num(/(\d+(?:[.,]\d+)?)\s*cl\b/.exec(t));
  const ml = num(/(\d+(?:[.,]\d+)?)\s*ml\b/.exec(t));
  const lt = num(/(\d+(?:[.,]\d+)?)\s*(?:lt|litre|liter)\b/.exec(t));
  const gr = num(/(\d+(?:[.,]\d+)?)\s*(?:gr|gram)\b/.exec(t));
  const kg = num(/(\d+(?:[.,]\d+)?)\s*(?:kg|kilogram)\b/.exec(t));
  return {
    cl: cl ?? (ml !== null ? ml / 10 : lt !== null ? lt * 100 : null),
    gr: gr ?? (kg !== null ? kg * 1000 : null),
    lt,
  };
}

/**
 * Detects a row's unit. The unit/package column decides the unit code; the
 * product name only contributes package sizes ("FESLEĞEN TAZE (25 GR)").
 */
export function detectRowUnit(unitText: string, nameText = ""): RowUnitInfo {
  const u = ` ${unitText} `;
  const n = ` ${nameText} `;
  const out: RowUnitInfo = { unit: null, sizeCl: null, sizeGr: null, perPackage: null };

  out.unit = unitCodeOf(u) ?? unitCodeOf(n);

  const su = sizes(u);
  const sn = sizes(n);
  out.sizeCl = su.cl ?? sn.cl;
  out.sizeGr = su.gr ?? sn.gr;

  const per = /(\d+)\s*(?:adet|li|lu|lik)\b/.exec(u) ?? /(\d+)\s*(?:adet|li|lu|lik)\b/.exec(n);
  if ((out.unit === "KOLI" || out.unit === "PAKET") && per) out.perPackage = Number(per[1]);

  return out;
}
