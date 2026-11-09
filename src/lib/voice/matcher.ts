import {
  normalizeText,
  phoneticKey,
  similarity,
  skeletonKey,
  skeletonSimilarity,
  tokenize,
} from "./text";
import { digitizeGluedNumbers } from "./numbers";
import type { ParsedUtterance } from "./parser";
import type { ProductRow } from "./productIndex";
import type { AliasRecord } from "./aliases";

export type MatchConfidence = "HIGH" | "MEDIUM" | "LOW";

export interface MatchCandidate {
  row: ProductRow;
  score: number;
  reason: string;
}

export interface MatchResult {
  candidates: MatchCandidate[];
  best: MatchCandidate | null;
  confidence: MatchConfidence;
  aliasUsed: AliasRecord | null;
}

const nameTokenCache = new WeakMap<ProductRow, string[]>();
function rowNameTokens(row: ProductRow): string[] {
  let v = nameTokenCache.get(row);
  if (!v) {
    v = tokenize(row.name);
    nameTokenCache.set(row, v);
  }
  return v;
}

/** Skeleton keys of a row's name words (no digits), cached per row. */
const skeletonCache = new WeakMap<ProductRow, string[]>();
function rowSkeletons(row: ProductRow): string[] {
  let v = skeletonCache.get(row);
  if (!v) {
    v = tokenize(row.name)
      .filter((t) => !/^\d/.test(t))
      .map(skeletonKey);
    skeletonCache.set(row, v);
  }
  return v;
}

/**
 * Best sound-alike match of the spoken skeleton against any run of up to 4 name words, with how
 * close the plain spelling of that run is (a sound-alike that also looks alike is much safer).
 */
function skeletonScore(
  querySkel: string,
  queryPlain: string,
  row: ProductRow,
): { sim: number; plain: number } {
  if (querySkel.length < 3) return { sim: 0, plain: 0 };
  const skels = rowSkeletons(row);
  const plains = rowNameTokens(row).filter((t) => !/^\d/.test(t));
  let best = { sim: 0, plain: 0 };
  for (let i = 0; i < skels.length; i++) {
    let joined = "";
    let plainJoined = "";
    for (let j = i; j < Math.min(skels.length, i + 4); j++) {
      joined += skels[j];
      plainJoined += plains[j] ?? "";
      if (joined.length < 3) continue;
      const sim = skeletonSimilarity(querySkel, joined);
      if (sim > best.sim) best = { sim, plain: similarity(queryPlain, plainJoined) };
    }
  }
  return best;
}

function scoreRow(
  queryNorm: string,
  queryTokens: string[],
  queryPhonTokens: string[],
  queryPhon: string,
  querySkel: string,
  queryPlain: string,
  row: ProductRow,
) {
  if (!queryNorm) return { score: 0, reason: "empty" };
  const nameNorm = normalizeText(row.name);
  if (nameNorm === queryNorm) return { score: 1, reason: "exact" };
  if (row.norm === queryNorm) return { score: 0.98, reason: "exact+unit" };

  const rowTokens = row.tokens;
  const contained = queryTokens.filter((t, qi) => {
    if (rowTokens.some((rt) => rt === t || (t.length >= 4 && rt.startsWith(t)))) return true;
    // the recognizer often appends a syllable ("barbareros" for "barbare")
    if (rowTokens.some((rt) => rt.length >= 5 && t.length > rt.length && t.startsWith(rt)))
      return true;
    // English brand names spoken with Turkish pronunciation ("cek deniels" ~ "jack daniels")
    // (the vowel-blind phonetic key alone is too loose: "civas" ~ "ceviz", so the consonants must agree too)
    const qp = queryPhonTokens[qi];
    if (!qp || qp.length < 3) return false;
    const at = row.phonTokens.indexOf(qp);
    if (at < 0) return false;
    const nameToken = rowNameTokens(row)[at] ?? "";
    return (
      skeletonSimilarity(skeletonKey(t), skeletonKey(nameToken)) >= 0.9 &&
      similarity(t, nameToken) >= 0.6
    );
  }).length;
  const coverage = queryTokens.length ? contained / queryTokens.length : 0;

  let score = 0;
  let reason = "fuzzy";

  if (coverage === 1) {
    // word-order independent full token match
    score = 0.9 + Math.min(0.06, (queryTokens.length / Math.max(rowTokens.length, 1)) * 0.06);
    reason = "tokens";
  } else if (coverage > 0) {
    score = 0.55 + coverage * 0.3;
    reason = "partial";
  }

  if (nameNorm.includes(queryNorm) && queryNorm.length >= 4) {
    score = Math.max(score, 0.86);
    reason = score === 0.86 ? "substring" : reason;
  }

  const sim = similarity(queryNorm, nameNorm);
  if (sim > score) {
    score = sim;
    reason = "similarity";
  }
  const phon = similarity(queryPhon, row.phon) * 0.94;
  if (phon > score) {
    score = phon;
    reason = "phonetic";
  }
  const { sim: skel, plain } = skeletonScore(querySkel, queryPlain, row);
  if (skel >= 0.8) {
    // the skeleton ignores digits, so a spoken "13" must still be found in the name ("chivas 13")
    const digits = queryTokens.filter((t) => /^\d+$/.test(t));
    const digitCover = digits.length
      ? digits.filter((d) => row.tokens.includes(d)).length / digits.length
      : 1;
    const sk = skel * (skel >= 0.9 && plain >= 0.8 ? 0.85 : 0.8) * digitCover; // sound-alike alone never reaches HIGH: it asks
    if (sk > score) {
      score = sk;
      reason = "sounds-like";
    }
  }
  return { score, reason };
}

export function matchProduct(
  index: ProductRow[],
  productText: string,
  aliases: AliasRecord[] = [],
): MatchResult {
  const queryTokens = digitizeGluedNumbers(tokenize(productText));
  const queryNorm = queryTokens.join(" ");
  const queryPhon = phoneticKey(queryNorm);
  const queryPhonTokens = queryTokens.map(phoneticKey);
  const querySkel = queryTokens.map(skeletonKey).join("");
  const queryPlain = queryTokens.filter((t) => !/^\d/.test(t)).join("");

  const alias =
    aliases.find((a) => a.normalizedAlias === queryNorm) ??
    aliases.find(
      (a) => a.normalizedAlias.length > 3 && similarity(a.normalizedAlias, queryNorm) > 0.9,
    ) ??
    null;

  // A learned name inside a longer sentence ("köri toz 735 gram" after learning "köri"): the extra
  // word is a description, so the learned product still wins over products matching only that word.
  const containedAlias = alias
    ? null
    : (aliases
        .filter(
          (a) =>
            a.normalizedAlias.length >= 3 &&
            a.normalizedAlias.split(" ").every((t) => queryTokens.includes(t)),
        )
        .sort(
          (x, y) =>
            y.normalizedAlias.length - x.normalizedAlias.length || y.confidence - x.confidence,
        )[0] ?? null);

  const scored: MatchCandidate[] = [];
  for (const row of index) {
    const { score, reason } = scoreRow(queryNorm, queryTokens, queryPhonTokens, queryPhon, querySkel, queryPlain, row);
    const rowNorm = normalizeText(row.name);
    const isLearned =
      (alias && normalizeText(alias.targetProductName) === rowNorm) ||
      (containedAlias && normalizeText(containedAlias.targetProductName) === rowNorm);
    // a learned name needs no sound-alike evidence of its own: the user taught that pairing
    if (score < 0.42 && !isLearned) continue;
    let final = score;
    let why = reason;
    if (alias && normalizeText(alias.targetProductName) === normalizeText(row.name)) {
      final = Math.max(final, 0.8) + Math.min(0.18, 0.08 + alias.confidence * 0.1);
      why = "learned";
    }
    if (
      containedAlias &&
      normalizeText(containedAlias.targetProductName) === normalizeText(row.name)
    ) {
      final = Math.max(final, 0.88); // stays below a product whose own words all match
      why = "learned-part";
    }
    scored.push({ row, score: Math.min(1, final), reason: why });
  }
  scored.sort((a, b) => b.score - a.score);

  const candidates = scored.slice(0, 6);
  const best = candidates[0] ?? null;

  const confidence = confidenceOf(candidates);
  return { candidates, best, confidence, aliasUsed: alias ?? containedAlias };
}

/** HIGH only for an exact/learned hit or a clear winner over every other product group. */
function confidenceOf(candidates: MatchCandidate[]): MatchConfidence {
  const best = candidates[0];
  if (!best) return "LOW";
  const otherGroup = candidates.find((c) => c.row.groupKey !== best.row.groupKey);
  const gap = best.score - (otherGroup?.score ?? 0);
  const exactish = best.score >= 0.98 || best.reason === "exact" || best.reason === "learned";
  if (exactish || (best.score >= 0.86 && (!otherGroup || gap >= 0.08))) return "HIGH";
  return best.score >= 0.62 ? "MEDIUM" : "LOW";
}

/**
 * Folds the recognizer's other hearings of the same sentence into the main match: the best score
 * of every product wins, so the user is asked about the likeliest 2-3 products across all
 * hearings. `weight` (0..1) discounts a hearing the recognizer itself was unsure about.
 */
export function mergeMatches(
  main: MatchResult,
  others: Array<{ match: MatchResult; weight: number }>,
): MatchResult {
  const byRow = new Map<string, MatchCandidate>();
  const add = (c: MatchCandidate, factor: number) => {
    const score = Math.min(1, c.score * factor);
    const have = byRow.get(c.row.rowId);
    if (!have || score > have.score) byRow.set(c.row.rowId, { ...c, score });
  };
  main.candidates.forEach((c) => add(c, 1));
  // another hearing never turns a doubtful match into a confident one by itself: its candidates
  // are capped just below the HIGH line
  others.forEach((o) => o.match.candidates.forEach((c) => add(c, Math.min(o.weight, 0.99))));
  const candidates = [...byRow.values()].sort((a, b) => b.score - a.score).slice(0, 6);
  const capped = candidates.map((c) =>
    main.candidates.some((m) => m.row.rowId === c.row.rowId && m.score >= c.score)
      ? c
      : { ...c, score: Math.min(c.score, 0.85) },
  );
  capped.sort((a, b) => b.score - a.score);
  return {
    candidates: capped,
    best: capped[0] ?? null,
    confidence: confidenceOf(capped),
    aliasUsed: main.aliasUsed,
  };
}

/** Distinct product groups among candidates (for the ambiguity picker). */
export function candidateGroups(candidates: MatchCandidate[]): MatchCandidate[] {
  const seen = new Set<string>();
  const out: MatchCandidate[] = [];
  for (const c of candidates) {
    if (seen.has(c.row.groupKey)) continue;
    seen.add(c.row.groupKey);
    out.push(c);
  }
  return out;
}

/**
 * "şivas on iki" parses as product "şivas" + quantity 12. When the product text alone is not
 * a confident match but appending the unitless integer to it is, the number belongs to the
 * product name ("WHY CHIVAS 12 YRS") and is removed from the quantities.
 */
export function matchProductWithNameNumber(
  index: ProductRow[],
  u: ParsedUtterance,
  aliases: AliasRecord[] = [],
): { match: MatchResult; utterance: ParsedUtterance } {
  const plain = matchProduct(index, u.productText, aliases);
  const first = u.terms[0];
  if (
    plain.confidence === "HIGH" ||
    !first ||
    first.unit !== null ||
    !Number.isInteger(first.quantity)
  ) {
    return { match: plain, utterance: u };
  }
  const withNumber = matchProduct(index, `${u.productText} ${first.quantity}`, aliases);
  const numberInName = withNumber.best?.row.tokens.includes(String(first.quantity)) ?? false;
  // a name that clearly improves once the number is part of it also takes the number
  // ("çivas on beş": Chivas 15), even when it is not confident enough to write unasked
  const clearlyBetter =
    withNumber.confidence !== "LOW" &&
    withNumber.best !== null &&
    plain.best !== null &&
    withNumber.best.score >= plain.best.score + 0.05;
  if ((withNumber.confidence === "HIGH" || clearlyBetter) && numberInName) {
    return {
      match: withNumber,
      utterance: {
        ...u,
        productText: `${u.productText} ${first.quantity}`,
        terms: u.terms.slice(1),
        quantity: u.terms[1]?.quantity ?? null,
        spokenUnit: u.terms[1]?.spokenUnit ?? null,
        normalizedQuantity: u.terms[1]?.quantity ?? null,
        normalizedUnit: u.terms[1]?.unit ?? null,
      },
    };
  }
  return { match: plain, utterance: u };
}
