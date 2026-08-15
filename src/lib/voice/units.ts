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
  /** units per package for KOLİ 24 ADET style rows. */
  perPackage: number | null;
}

export function detectRowUnit(text: string): RowUnitInfo {
  const t = ` ${text} `;
  const out: RowUnitInfo = { unit: null, sizeCl: null, perPackage: null };

  const sizeCl = /(\d+(?:[.,]\d+)?)\s*cl\b/.exec(t);
  const sizeMl = /(\d+(?:[.,]\d+)?)\s*ml\b/.exec(t);
  const sizeLt = /(\d+(?:[.,]\d+)?)\s*(?:lt|l|litre|liter)\b/.exec(t);
  if (sizeCl) out.sizeCl = Number(sizeCl[1]!.replace(",", "."));
  else if (sizeMl) out.sizeCl = Number(sizeMl[1]!.replace(",", ".")) / 10;

  const per = /(\d+)\s*(?:adet|li|lu|lik)\b/.exec(t);

  if (/\bkoli|kasa\b/.test(t)) out.unit = "KOLI";
  else if (/\bsise|bottle\b/.test(t)) out.unit = "SISE";
  else if (/\bpaket\b/.test(t)) out.unit = "PAKET";
  else if (/\bfici|varil|keg\b/.test(t)) out.unit = "FICI";
  else if (/\bgram|\bgr\b/.test(t)) out.unit = "GRAM";
  else if (/\bkg\b|kilogram|\bkilo\b/.test(t)) out.unit = "KG";
  else if (/\bcl\b|santilitre/.test(t)) out.unit = "CL";
  else if (/\blitre\b|\bliter\b|\blt\b|\bl\b/.test(t)) out.unit = "L";
  else if (/\badet|\btane\b/.test(t)) out.unit = "ADET";

  if ((out.unit === "KOLI" || out.unit === "PAKET") && per) out.perPackage = Number(per[1]);
  if (out.unit === "SISE" && out.sizeCl === null && sizeLt)
    out.sizeCl = Number(sizeLt[1]!.replace(",", ".")) * 100;

  return out;
}
