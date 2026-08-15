import { normalizeText, similarity, tokenize } from "./text";
import type { ProductRow } from "./productIndex";

export interface StockHit {
  row: ProductRow;
  score: number;
}

/**
 * Searches the actual STOK MALI (product name) column only – never stock groups.
 * Distinct unit/package rows of the same product are kept separate.
 */
export function searchStock(index: ProductRow[], query: string, limit = 25): StockHit[] {
  const q = normalizeText(query);
  if (q.length < 2) return [];
  const qTokens = tokenize(query);
  const hits: StockHit[] = [];

  for (const row of index) {
    const name = normalizeText(row.name);
    if (!name) continue;
    const tokens = tokenize(row.name);
    let score = 0;
    if (name === q) score = 1;
    else if (tokens.includes(q)) score = 0.94;
    else if (name.startsWith(q)) score = 0.9;
    else if (tokens.some((t) => t.startsWith(q))) score = 0.86;
    else if (qTokens.length > 0 && qTokens.every((t) => tokens.some((rt) => rt.startsWith(t))))
      score = 0.8;
    else if (name.includes(q)) score = 0.7;
    else {
      const sim = similarity(q, name);
      if (sim >= 0.62) score = sim * 0.6;
    }
    if (score > 0) hits.push({ row, score });
  }

  hits.sort((a, b) => b.score - a.score || a.row.rowNumber - b.row.rowNumber);
  return hits.slice(0, limit);
}
