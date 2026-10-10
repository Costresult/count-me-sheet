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

export const POINT_WORDS = new Set(["nokta", "virgul"]);

/**
 * Fraction digits spoken after "nokta"/"virgül": "iki" -> "2", "otuz dört" -> "34",
 * "sıfır sıfır beş" -> "005", "5" -> "5". Returns null when no digits follow.
 */
function parseFractionDigits(tokens: string[], i: number): { digits: string; length: number } | null {
  let digits = "";
  let j = i;
  while (j < tokens.length) {
    const t = tokens[j]!;
    if (t === "sifir") {
      digits += "0";
      j++;
    } else if (t in ONES) {
      digits += String(ONES[t]!);
      j++;
    } else if (t in TENS) {
      let v = TENS[t]!;
      j++;
      const next = tokens[j];
      if (next && next in ONES && ONES[next]! > 0) {
        v += ONES[next]!;
        j++;
      }
      digits += String(v);
      break;
    } else if (/^\d+$/.test(t)) {
      digits += t;
      j++;
      break;
    } else {
      break;
    }
  }
  return digits ? { digits, length: j - i } : null;
}

/**
 * Spoken decimals: "nokta iki" = 0.2, "bir nokta beş" = 1.5, "nokta sıfır sıfır beş" = 0.005.
 * Starts at an optional integer part followed by a point word, or at the point word itself.
 */
export function parseDecimalAt(tokens: string[], i: number): NumberMatch | null {
  let intPart = 0;
  let idx = i;
  if (!POINT_WORDS.has(tokens[idx] ?? "")) {
    const whole = parseNumberAt(tokens, idx);
    if (!whole || !POINT_WORDS.has(tokens[idx + whole.length] ?? "")) return null;
    intPart = whole.value;
    idx += whole.length;
  }
  const frac = parseFractionDigits(tokens, idx + 1);
  if (!frac) return null;
  const value = Number(`${intPart}.${frac.digits}`);
  return { value, length: idx + 1 + frac.length - i };
}

const GLUED_TENS_ONES = new RegExp(
  `^(${Object.keys(TENS).join("|")})(${Object.keys(ONES).filter((k) => k !== "sifir").join("|")})?$`,
);

/** Product-name numbers spoken as one word ("oniki", "onsekiz", "yirmibes") become digits. */
export function digitizeGluedNumbers(tokens: string[]): string[] {
  return tokens.map((t) => {
    const m = GLUED_TENS_ONES.exec(t);
    if (!m || !m[2]) return t;
    return String(TENS[m[1]!]! + ONES[m[2]]!);
  });
}
