/** Turkish spoken-number parsing (words + digit formats with , or . decimals). */

const ONES: Record<string, number> = {
  sifir: 0, bir: 1, iki: 2, uc: 3, dort: 4, bes: 5, alti: 6, yedi: 7, sekiz: 8, dokuz: 9,
};
const TENS: Record<string, number> = {
  on: 10, yirmi: 20, otuz: 30, kirk: 40, elli: 50, altmis: 60, yetmis: 70, seksen: 80, doksan: 90,
};
const SCALES: Record<string, number> = { yuz: 100, bin: 1000 };

export const FRACTIONS: Record<string, number> = { yarim: 0.5, ceyrek: 0.25, buculk: 0.5 };

export const isNumberWord = (t: string): boolean =>
  t in ONES || t in TENS || t in SCALES || t in FRACTIONS || t === "bucuk" || /^\d/.test(t);

const digitValue = (t: string): number | null => {
  // 1.40 / 1,40 / 0,5 / 140
  if (!/^\d+([.,]\d+)?$/.test(t)) return null;
  const n = Number(t.replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

export interface NumberMatch {
  value: number;
  length: number;
}

/** Parses a number starting at tokens[i]; returns null when tokens[i] is not numeric. */
export function parseNumberAt(tokens: string[], i: number): NumberMatch | null {
  let idx = i;
  let total = 0;
  let current = 0;
  let matched = false;
  let digitMatched = false;

  while (idx < tokens.length) {
    const t = tokens[idx]!;
    const d = digitValue(t);
    if (d !== null) {
      if (matched) break;
      total = d;
      matched = true;
      digitMatched = true;
      idx++;
      // a digit is a complete number: "47 bir" is two separate numbers
      break;
    }
    if (digitMatched) break;
    if (t in SCALES) {
      const scale = SCALES[t]!;
      current = (current === 0 ? 1 : current) * scale;
      matched = true;
      idx++;
      continue;
    }
    if (t in TENS) {
      if (matched && current % 100 !== 0 && current !== 0) break;
      current += TENS[t]!;
      matched = true;
      idx++;
      continue;
    }
    if (t in ONES) {
      current += ONES[t]!;
      matched = true;
      idx++;
      continue;
    }
    if (t === "yarim") {
      if (matched) break;
      total = 0.5;
      matched = true;
      idx++;
      break;
    }
    if (t === "ceyrek") {
      if (matched) break;
      total = 0.25;
      matched = true;
      idx++;
      break;
    }
    if (t === "bucuk") {
      if (!matched) break;
      total += current + 0.5;
      current = 0;
      idx++;
      return { value: total, length: idx - i };
    }
    break;
  }

  if (!matched) return null;
  return { value: total + current, length: idx - i };
}
