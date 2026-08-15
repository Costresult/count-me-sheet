/** Turkish-aware text normalization helpers shared by the voice engine. */

export const trLower = (s: string): string =>
  s.replace(/İ/g, "i").replace(/I/g, "ı").toLowerCase();

export const foldTr = (s: string): string =>
  trLower(s)
    .replace(/ç/g, "c")
    .replace(/ğ/g, "g")
    .replace(/ı/g, "i")
    .replace(/ö/g, "o")
    .replace(/ş/g, "s")
    .replace(/ü/g, "u");

/** lowercase, accent folded, punctuation stripped, single spaced. */
export const normalizeText = (s: string): string =>
  foldTr(s)
    .replace(/['’`´"]/g, "")
    .replace(/[^a-z0-9.,]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export const tokenize = (s: string): string[] => normalizeText(s).split(" ").filter(Boolean);

/** Rough phonetic key so "ginfort" ≈ "gin forte" and "vodka" ≈ "votka". */
export function phoneticKey(s: string): string {
  let t = normalizeText(s).replace(/[^a-z0-9]/g, "");
  t = t
    .replace(/ph/g, "f")
    .replace(/ck/g, "k")
    .replace(/q/g, "k")
    .replace(/w/g, "v")
    .replace(/x/g, "ks")
    .replace(/y/g, "i")
    .replace(/j/g, "z")
    .replace(/d(?=$)/g, "t")
    .replace(/b(?=$)/g, "p")
    .replace(/c/g, "k")
    .replace(/g/g, "k")
    .replace(/z/g, "s")
    .replace(/v/g, "f")
    .replace(/[aeiou]+/g, "a");
  t = t.replace(/(.)\1+/g, "$1");
  return t;
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(
        prev[j]! + 1,
        cur[j - 1]! + 1,
        prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev = cur;
  }
  return prev[b.length]!;
}

/** 0..1 similarity. */
export const similarity = (a: string, b: string): number => {
  const max = Math.max(a.length, b.length);
  if (max === 0) return 1;
  return 1 - levenshtein(a, b) / max;
};
