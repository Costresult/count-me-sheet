import { normalizeText, tokenize } from "./text";
import { parseDecimalAt, parseNumberAt } from "./numbers";
import { familyOf, isUnitToken, MILLILITRE_TOKENS, unitFromToken, type UnitCode } from "./units";

export type Operation = "single" | "plus" | "multiply";

export interface SpokenTerm {
  quantity: number;
  spokenUnit: string | null;
  unit: UnitCode | null;
}

export interface ParsedUtterance {
  productText: string;
  /** first term quantity (spec field) */
  quantity: number | null;
  spokenUnit: string | null;
  normalizedQuantity: number | null;
  normalizedUnit: UnitCode | null;
  operation: Operation;
  terms: SpokenTerm[];
  /** bottle size implied by "70'lik" / "yetmişlik" */
  bottleSizeCl: number | null;
  /** set when the sentence is ambiguous and the user must confirm (e.g. a bare "200") */
  needsConfirmation?: "LARGE_BARE_NUMBER" | undefined;
  /** true when the sentence explicitly means "add to the previous target" (+1, artı 1, bir tane daha) */
  additive: boolean;
  confidence: number;
  rawTranscript: string;
  normalizedTranscript: string;
}

const PLUS = new Set(["arti", "plus", "+", "ve"]);
const TIMES = new Set(["carpi", "x", "kere", "çarpı"]);
const NOISE = new Set(["tane", "adetten", "den", "dan", "lik", "luk", "yani", "hemen", "sey", "iste"]);
const MORE = new Set(["daha", "ekle"]);

/** "35cl", "70CL", "250ml", "1.5lt" spoken as one glued token. */
const GLUED = /^(\d+(?:[.,]\d+)?)(cl|ml|lt|litre|l|kg|gr|gram|g|adet)$/;

/** Splits glued number+unit tokens so the unit is never dropped. */
function expandTokens(rawTokens: string[]): string[] {
  // "45x6" / "tutsulenmis.45x6": a multiplication written without spaces
  const tokens = rawTokens.flatMap((t) => {
    const m = /^([a-z]*[.,]?\d+(?:[.,]\d+)?)x(\d+(?:[.,]\d+)?)$/.exec(t);
    return m ? [m[1]!, "x", m[2]!] : [t];
  });
  const out: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]!;
    // "si el" / "se el" / "c l" are how the recognizer sometimes writes a spoken "cl"
    const pair = `${t} ${tokens[i + 1] ?? ""}`;
    if (i > 0 && /^\d/.test(tokens[i - 1]!) && /^(si el|se el|sı el|c l|s l)$/.test(pair)) {
      out.push("cl");
      i++;
      continue;
    }
    const m = GLUED.exec(t);
    const hundreds = /^(iki|uc|dort|bes|alti|yedi|sekiz|dokuz)yuz$/.exec(t); // "beşyüz" -> "bes yuz"
    if (hundreds) {
      out.push(hundreds[1]!, "yuz");
      continue;
    }
    // "72'si" is how the recognizer writes a spoken "72 cl" (…si-el)
    const spokenCl = /^(\d+(?:[.,]\d+)?)(si|sel)$/.exec(t);
    if (spokenCl) {
      out.push(spokenCl[1]!, "cl");
      continue;
    }
    // "pirinç.72" (a spoken "nokta 72" glued to the word): word + decimal
    const gluedPoint = /^([a-z]+)[.,](\d+)$/.exec(t);
    if (gluedPoint) {
      out.push(gluedPoint[1]!, "nokta", gluedPoint[2]!);
      continue;
    }
    const frac = /^[.,](\d+)$/.exec(t);
    if (m) out.push(m[1]!, m[2]!);
    else if (frac) out.push("nokta", frac[1]!);
    else out.push(t);
  }
  return out;
}

/** "70lik", "70likten", "yetmislik" -> bottle size in CL */
function bottleSizeToken(token: string): number | null {
  const m = /^(\d+)(lik|lik|luk|luk|lik)(ten|tan|den|dan)?$/.exec(token);
  if (m) return Number(m[1]);
  const w = /^(.+?)(lik|luk)(ten|tan|den|dan)?$/.exec(token);
  if (w) {
    const n = parseNumberAt([w[1]!], 0);
    if (n && n.value >= 5) return n.value;
  }
  return null;
}

export function parseUtterance(raw: string): ParsedUtterance {
  const normalizedTranscript = normalizeText(raw);
  const tokens = expandTokens(tokenize(raw));
  const rawTrimmed = raw.trim();
  const additive =
    rawTrimmed.startsWith("+") ||
    (tokens.length > 0 && PLUS.has(tokens[0]!) && tokens[0] !== "ve") ||
    tokens.some((t) => MORE.has(t));

  interface Located extends SpokenTerm {
    start: number;
    end: number;
    /** "… şişe" with no number: an assumed quantity of 1 */
    implicit?: boolean;
  }
  const located: Located[] = [];
  const skip = new Set<number>();
  let operation: Operation = "single";
  let bottleSizeCl: number | null = null;

  let i = 0;
  while (i < tokens.length) {
    const t = tokens[i]!;

    if (PLUS.has(t)) {
      if (located.length > 0) operation = "plus";
      skip.add(i);
      i++;
      continue;
    }
    if (TIMES.has(t)) {
      if (located.length > 0) operation = "multiply";
      skip.add(i);
      i++;
      continue;
    }

    const size = bottleSizeToken(t);
    if (size !== null) {
      bottleSizeCl = size;
      skip.add(i);
      i++;
      continue;
    }

    const num = parseDecimalAt(tokens, i) ?? parseNumberAt(tokens, i);
    if (num) {
      let j = i + num.length;
      let unit: UnitCode | null = null;
      let spokenUnit: string | null = null;
      let value = num.value;
      const next = tokens[j];
      if (next && MILLILITRE_TOKENS.has(next)) {
        unit = "CL";
        spokenUnit = next;
        value = value / 10;
        j++;
      } else if (next && isUnitToken(next)) {
        unit = unitFromToken(next);
        spokenUnit = next;
        j++;
      }
      located.push({ quantity: value, spokenUnit, unit, start: i, end: j });
      i = j;
      continue;
    }

    // bare unit word without a number => quantity 1 ("… şişe")
    if (isUnitToken(t) && located.length === 0 && i > 0) {
      located.push({ quantity: 1, spokenUnit: t, unit: unitFromToken(t), start: i, end: i + 1, implicit: true });
      i++;
      continue;
    }
    i++;
  }

  // Numbers that belong to the product name ("Monkey 47", "Chivas Regal 18") carry no
  // unit; when a measured term exists in the same sentence they stay part of the name.
  // A unit word with no number ("kişniş TANE 900 gram", "sprite ŞİŞE 3 adet") is part of the product
  // name when the sentence also has a real quantity; the assumed "1" is dropped.
  const keepInName = new Set<number>();
  if (located.some((t) => !t.implicit)) {
    for (let li = located.length - 1; li >= 0; li--) {
      if (located[li]!.implicit) {
        keepInName.add(located[li]!.start);
        located.splice(li, 1);
      }
    }
  }
  const measured = located.filter((t) => t.unit !== null);
  const kept = operation === "single" && measured.length > 0 ? measured : located;

  const firstKept = kept.length > 0 ? Math.min(...kept.map((t) => t.start)) : tokens.length;
  const keptRanges = kept.map((t) => [t.start, t.end] as const);
  const productTokens: string[] = [];
  for (let k = 0; k < firstKept; k++) {
    if (skip.has(k) || (NOISE.has(tokens[k]!) && !keepInName.has(k))) continue;
    if (keptRanges.some(([a, b]) => k >= a && k < b)) continue;
    productTokens.push(tokens[k]!);
  }

  const terms: SpokenTerm[] = kept.map(({ quantity, spokenUnit, unit }) => ({
    quantity,
    spokenUnit,
    unit,
  }));

  // "1 kilo 500 gram" / "2 litre 50 cl": several measures of the same kind in one sentence are one
  // amount, so they are added together (1.5 kg, 2.5 L) instead of keeping only the first.
  if (operation === "single" && terms.length >= 2) {
    const families = terms.map((t) => (t.unit ? familyOf(t.unit) : "none"));
    if (families.every((f) => f === families[0] && f !== "count" && f !== "none")) operation = "plus";
  }

  const productText = productTokens.join(" ").trim();
  const first = terms[0] ?? null;

  let confidence = 0.4;
  if (productText.length >= 3) confidence += 0.25;
  if (productText.split(" ").length >= 2) confidence += 0.1;
  if (first) confidence += 0.15;
  if (first?.unit) confidence += 0.1;

  const needsConfirmation = terms.some((t) => t.unit === null && t.quantity >= 100)
    ? ("LARGE_BARE_NUMBER" as const)
    : undefined;

  return {
    needsConfirmation,
    productText,
    quantity: first ? first.quantity : null,
    spokenUnit: first?.spokenUnit ?? null,
    normalizedQuantity: first ? first.quantity : null,
    normalizedUnit: first?.unit ?? null,
    operation,
    terms,
    bottleSizeCl,
    additive,
    confidence: Math.min(1, confidence),
    rawTranscript: raw,
    normalizedTranscript,
  };
}
