import { describe, expect, it } from "vitest";
import { parseUtterance } from "@/lib/voice/parser";

const q = (s: string) => parseUtterance(s).terms[0]?.quantity;

describe("spoken decimals", () => {
  it.each([
    ["malibu nokta iki", 0.2],
    ["malibu .2", 0.2],
    ["malibu 0,2", 0.2],
    ["malibu nokta otuz dört", 0.34],
    ["badem bir nokta beş", 1.5],
    ["x nokta sıfır sıfır beş", 0.005],
    ["malibu virgül iki", 0.2],
    ["malibu sıfır virgül iki", 0.2],
  ])("%s -> %d", (s, v) => {
    expect(q(s)).toBeCloseTo(v, 6);
  });

  it("keeps the product name clean", () => {
    expect(parseUtterance("jack daniels nokta beş").productText).toBe("jack daniels");
  });

  it("parses units", () => {
    const p = parseUtterance("malibu 1 şişe");
    expect(p.terms[0]).toMatchObject({ quantity: 1, unit: "SISE" });
  });

  it("asks for confirmation on a large bare number", () => {
    expect(parseUtterance("malibu 200").needsConfirmation).toBe("LARGE_BARE_NUMBER");
    expect(parseUtterance("malibu nokta iki").needsConfirmation).toBeUndefined();
  });
});

describe("unit word inside a product name", () => {
  it("keeps 'tane' in the name and reads 900 gram as the quantity", () => {
    const p = parseUtterance("kişniş tane 900 gram");
    expect(p.productText).toBe("kisnis tane");
    expect(p.terms).toHaveLength(1);
    expect(p.terms[0]).toMatchObject({ quantity: 900, unit: "GRAM" });
  });

  it("still assumes 1 for a bare trailing unit", () => {
    const p = parseUtterance("malibu şişe");
    expect(p.terms[0]).toMatchObject({ quantity: 1, unit: "SISE" });
  });
});

describe("how the recognizer writes 'nokta 72' and '72 cl'", () => {
  it("splits a decimal glued to the product word", () => {
    const p = parseUtterance("sirke pirinç.72");
    expect(p.productText).toBe("sirke pirinc");
    expect(p.terms[0]?.quantity).toBeCloseTo(0.72, 6);
    expect(p.terms[0]?.unit).toBeNull();
  });

  it("reads a number + 'si' as centilitres and ignores filler words", () => {
    const p = parseUtterance("sirke pirinç 72'si yani");
    expect(p.productText).toBe("sirke pirinc");
    expect(p.terms[0]).toMatchObject({ quantity: 72, unit: "CL" });
  });
});
