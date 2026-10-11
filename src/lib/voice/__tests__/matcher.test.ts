import { describe, expect, it } from "vitest";
import { matchProduct, matchProductWithNameNumber } from "@/lib/voice/matcher";
import { parseUtterance } from "@/lib/voice/parser";
import { fixtureIndex } from "./helpers";

const index = fixtureIndex();
const names = (q: string, n = 6) =>
  matchProduct(index, q).candidates.slice(0, n).map((c) => c.row.name);

describe("product matching on the September workbook", () => {
  it("ignores group prefixes (LQR/WHY)", () => {
    expect(matchProduct(index, "malibu").best?.row.name).toBe("LQR MALIBU");
    expect(matchProduct(index, "jack daniels apple").best?.row.name).toBe("WHY JACK DANIELS APPLE");
  });

  it("matches English brands spoken with Turkish pronunciation", () => {
    expect(names("cek deniels")).toContain("WHY JACK DANIELS APPLE");
    expect(names("sivas regal")).toContain("WHY CHIVAS 12 YRS");
  });

  it("treats a number word as part of the product name", () => {
    const m = matchProduct(index, "şivas oniki");
    expect(m.best?.row.name).toBe("WHY CHIVAS 12 YRS");
    expect(m.confidence).toBe("HIGH");
  });

  it("moves a spoken number into the name when that is the confident match", () => {
    const { match, utterance } = matchProductWithNameNumber(index, parseUtterance("şivas 12"));
    expect(match.best?.row.name).toBe("WHY CHIVAS 12 YRS");
    expect(utterance.terms).toHaveLength(0);
  });

  it("keeps the quantity when the product is already clear", () => {
    const { utterance } = matchProductWithNameNumber(index, parseUtterance("malibu nokta iki"));
    expect(utterance.terms[0]?.quantity).toBeCloseTo(0.2);
  });

  it("does not read the 1 in 'coca cola 1 lt' as a quantity", () => {
    expect(matchProduct(index, "coca cola 1 lt").best?.row.name).toBe("COCA COLA 1 LT");
  });
});

describe("recognizer punctuation and spoken name numbers", () => {
  const route = (spoken: string) => {
    const { match, utterance } = matchProductWithNameNumber(index, parseUtterance(spoken));
    return { name: match.best?.row.name, terms: utterance.terms };
  };

  it.each(["Chivas 13 34 CL.", "Chivas 13, 34 cl.", "chivas 13 34 cl,", "Chivas 13 34 cl"])(
    "%s -> Chivas 13 Extra, 34 cl",
    (s) => {
      const r = route(s);
      expect(r.name).toBe("WHY CHIVAS 13 EXTRA");
      expect(r.terms[0]).toMatchObject({ quantity: 34, unit: "CL" });
    },
  );

  it("reads 'on üç' in a product name as 13", () => {
    expect(route("chivas on üç 34 cl").name).toBe("WHY CHIVAS 13 EXTRA");
  });
});
