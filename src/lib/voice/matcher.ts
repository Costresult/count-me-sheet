import { normalizeText, phoneticKey, similarity, tokenize } from "./text";
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

function scoreRow(queryNorm: string, queryTokens: string[], queryPhon: string, row: ProductRow) {
  if (!queryNorm) return { score: 0, reason: "empty" };
  const nameNorm = normalizeText(row.name);
  if (nameNorm === queryNorm) return { score: 1, reason: "exact" };
  if (row.norm === queryNorm) return { score: 0.98, reason: "exact+unit" };

  const rowTokens = row.tokens;
  const contained = queryTokens.filter((t) =>
    rowTokens.some((rt) => rt === t || (t.length >= 4 && rt.startsWith(t))),
  ).length;
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
  return { score, reason };
}

export function matchProduct(
  index: ProductRow[],
  productText: string,
  aliases: AliasRecord[] = [],
): MatchResult {
  const queryNorm = normalizeText(productText);
  const queryTokens = tokenize(productText);
  const queryPhon = phoneticKey(productText);

  const alias =
    aliases.find((a) => a.normalizedAlias === queryNorm) ??
    aliases.find((a) => a.normalizedAlias.length > 3 && similarity(a.normalizedAlias, queryNorm) > 0.9) ??
    null;

  const scored: MatchCandidate[] = [];
  for (const row of index) {
    const { score, reason } = scoreRow(queryNorm, queryTokens, queryPhon, row);
    if (score < 0.42) continue;
    let final = score;
    let why = reason;
    if (alias && normalizeText(alias.targetProductName) === normalizeText(row.name)) {
      final = Math.max(final, 0.8) + Math.min(0.18, 0.08 + alias.confidence * 0.1);
      why = "learned";
    }
    scored.push({ row, score: Math.min(1, final), reason: why });
  }
  scored.sort((a, b) => b.score - a.score);

  const candidates = scored.slice(0, 6);
  const best = candidates[0] ?? null;

  let confidence: MatchConfidence = "LOW";
  if (best) {
    const otherGroup = candidates.find((c) => c.row.groupKey !== best.row.groupKey);
    const gap = best.score - (otherGroup?.score ?? 0);
    const exactish = best.score >= 0.98 || best.reason === "exact" || best.reason === "learned";
    if (exactish || (best.score >= 0.86 && (!otherGroup || gap >= 0.08))) confidence = "HIGH";
    else if (best.score >= 0.62) confidence = "MEDIUM";
  }
  return { candidates, best, confidence, aliasUsed: alias };
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
