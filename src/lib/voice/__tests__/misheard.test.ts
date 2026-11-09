import { describe, expect, it } from "vitest";
import { candidateGroups, matchProductWithNameNumber } from "@/lib/voice/matcher";
import { parseUtterance } from "@/lib/voice/parser";
import { fixtureIndex } from "./helpers";
import { MISHEARD } from "./misheard.fixture";

const index = fixtureIndex();
describe("brand names heard in Turkish spelling (measured on the September list)", () => {
  it("finds the product, and never writes a wrong one unasked", () => {
    let top1 = 0, top3 = 0, high = 0, wrongHigh = 0;
    const lines: string[] = [];
    for (const [spoken, want] of MISHEARD) {
      const { match } = matchProductWithNameNumber(index, parseUtterance(spoken));
      const groups: string[] = [];
      for (const c of match.candidates) if (!groups.includes(c.row.groupKey)) groups.push(c.row.groupKey);
      const names = match.candidates.map((c) => c.row.name);
      const ok1 = !!match.best?.row.name.includes(want);
      const ok3 = candidateGroups(match.candidates).slice(0, 3).some((c) => c.row.name.includes(want) || match.candidates.some((m) => m.row.groupKey === c.row.groupKey && m.row.name.includes(want)));
      if (ok1) top1++;
      if (ok3) top3++;
      if (match.confidence === "HIGH") { high++; if (!ok1) wrongHigh++; }
      if (!ok1) lines.push(`${ok3 ? "T3" : "XX"} ${match.confidence} "${spoken}" -> ${match.best?.row.name} (${match.best?.score.toFixed(2)}) want ${want}`);
    }
    // before the sound-alike matching: top1 28/38, top3 32/38, 1 wrong auto-write
    expect(top1, lines.join("\n")).toBeGreaterThanOrEqual(35);
    expect(top3, lines.join("\n")).toBeGreaterThanOrEqual(36);
    expect(wrongHigh).toBe(0);
    expect(high).toBeGreaterThan(0);
  });
});
