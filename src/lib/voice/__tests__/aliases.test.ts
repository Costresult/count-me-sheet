import { describe, expect, it } from "vitest";
import { usedAlias, USE_CONFIDENCE_STEP, type AliasRecord } from "@/lib/voice/aliases";

const alias = (confidence: number, useCount?: number): AliasRecord => ({
  id: "muskat::muskat tane", spokenAlias: "muskat", normalizedAlias: "muskat", targetProductIdentity: "muskat tane",
  targetProductName: "MUSKAT TANE", targetUnit: null, correctionCount: 1, lastUsed: 1, confidence,
  source: "USER_SELECTION", ...(useCount ? { useCount } : {}),
});

describe("trust in a learned name", () => {
  it("grows a little with every successful use", () => {
    let a = alias(0.45);
    const seen: number[] = [];
    for (let i = 0; i < 3; i++) {
      a = usedAlias(a, 100 + i);
      seen.push(a.confidence);
    }
    expect(seen).toEqual([0.5, 0.55, 0.6]);
    expect(a.useCount).toBe(3);
    expect(a.lastUsed).toBe(102);
    expect(USE_CONFIDENCE_STEP).toBe(0.05);
  });

  it("never passes 95%", () => {
    expect(usedAlias(alias(0.94)).confidence).toBe(0.95);
    expect(usedAlias(alias(0.95)).confidence).toBe(0.95);
  });
});
