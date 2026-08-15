import { normalizeText, tokenize } from "./text";
import { parseNumberAt } from "./numbers";
import { isUnitToken, MILLILITRE_TOKENS, unitFromToken, type UnitCode } from "./units";

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
  confidence: number;
  rawTranscript: string;
  normalizedTranscript: string;
}

const PLUS = new Set(["arti", "plus", "+", "ve"]);
const TIMES = new Set(["carpi", "x", "kere", "çarpı"]);
const NOISE = new Set(["tane", "adetten", "den", "dan", "lik", "luk"]);

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
  const tokens = tokenize(raw);

  interface Located extends SpokenTerm {
    start: number;
    end: number;
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

    const num = parseNumberAt(tokens, i);
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
      located.push({ quantity: 1, spokenUnit: t, unit: unitFromToken(t), start: i, end: i + 1 });
      i++;
      continue;
    }
    i++;
  }

  // Numbers that belong to the product name ("Monkey 47", "Chivas Regal 18") carry no
  // unit; when a measured term exists in the same sentence they stay part of the name.
  const measured = located.filter((t) => t.unit !== null);
  const kept = operation === "single" && measured.length > 0 ? measured : located;

  const firstKept = kept.length > 0 ? Math.min(...kept.map((t) => t.start)) : tokens.length;
  const keptRanges = kept.map((t) => [t.start, t.end] as const);
  const productTokens: string[] = [];
  for (let k = 0; k < firstKept; k++) {
    if (skip.has(k) || NOISE.has(tokens[k]!)) continue;
    if (keptRanges.some(([a, b]) => k >= a && k < b)) continue;
    productTokens.push(tokens[k]!);
  }

  const terms: SpokenTerm[] = kept.map(({ quantity, spokenUnit, unit }) => ({
    quantity,
    spokenUnit,
    unit,
  }));

  const productText = productTokens.join(" ").trim();
  const first = terms[0] ?? null;

  let confidence = 0.4;
  if (productText.length >= 3) confidence += 0.25;
  if (productText.split(" ").length >= 2) confidence += 0.1;
  if (first) confidence += 0.15;
  if (first?.unit) confidence += 0.1;

  return {
    productText,
    quantity: first ? first.quantity : null,
    spokenUnit: first?.spokenUnit ?? null,
    normalizedQuantity: first ? first.quantity : null,
    normalizedUnit: first?.unit ?? null,
    operation,
    terms,
    bottleSizeCl,
    confidence: Math.min(1, confidence),
    rawTranscript: raw,
    normalizedTranscript,
  };
}
