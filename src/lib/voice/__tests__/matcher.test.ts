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

describe("learned names inside a longer sentence", () => {
  const alias = (spoken: string, target: string) =>
    ({
      id: spoken, spokenAlias: spoken, normalizedAlias: spoken, targetProductIdentity: target,
      targetProductName: target, targetUnit: null, correctionCount: 1, lastUsed: 0, confidence: 0.45,
      source: "USER_SELECTION",
    }) as never;

  it("uses a learned name even when an extra word is said ('köri toz' after learning 'köri')", () => {
    // without the alias the extra word 'toz' pulls another product
    expect(matchProduct(index, "malibu toz").best?.row.name).not.toBe("WHY JACK DANIELS APPLE");
    const m = matchProduct(index, "jek toz", [alias("jek", "WHY JACK DANIELS APPLE")]);
    expect(m.best?.row.name).toBe("WHY JACK DANIELS APPLE");
    expect(m.confidence).toBe("HIGH");
  });

  it("does not change anything when the learned name is not in the sentence", () => {
    const m = matchProduct(index, "malibu", [alias("jek", "WHY JACK DANIELS APPLE")]);
    expect(m.best?.row.name).toBe("LQR MALIBU");
  });

  it("lets a product whose own words all match win over a learned name", () => {
    const m = matchProduct(index, "chivas 18", [alias("chivas", "WHY CHIVAS 12 YRS")]);
    expect(m.best?.row.name).toBe("WHY CHIVAS 18 YRS");
  });
});

describe("sound-alike matching of brand names heard in Turkish spelling", () => {
  const top = (q: string) => {
    const m = matchProduct(index, q);
    return { name: m.best?.row.name, confidence: m.confidence };
  };

  it.each([
    ["yagermaister", "JAGERMEISTER"],
    ["ceymson", "JAMESON"],
    ["tanker ay", "TANQUERAY"],
    ["hendriks", "HENDRICKS"],
    ["beylis", "BAILEYS"],
    ["korona", "CORONA"],
  ])("%s is offered as %s", (spoken, want) => {
    expect(top(spoken).name).toContain(want);
  });

  it("never writes a sound-alike on its own: it asks", () => {
    for (const spoken of ["yagermaister", "ceymson", "tanker ay"]) {
      expect(top(spoken).confidence).not.toBe("HIGH");
    }
  });

  it("does not let a vowel-blind collision beat the real name", () => {
    expect(top("baileys").name).toBe("LQR BAILEYS");
    expect(top("baileys").confidence).toBe("HIGH");
    // "civas" must not become "ceviz"
    expect(top("sivas oniki").name).toBe("WHY CHIVAS 12 YRS");
  });
});

describe("what Whisper actually produced in the field log", () => {
  it("reads 'Chivas Regal 12.0.60' as Chivas 12 and 0.60", () => {
    const { match, utterance } = matchProductWithNameNumber(index, parseUtterance("Chivas Regal 12.0.60"));
    expect(match.best?.row.name).toBe("WHY CHIVAS 12 YRS");
    expect(utterance.terms[0]?.quantity).toBeCloseTo(0.6);
  });

  it("reads 'iki kişi' as 2 bottles", () => {
    const u = parseUtterance("barbare blush iki kişi");
    expect(u.terms[0]).toMatchObject({ quantity: 2, unit: "SISE" });
  });

  it("'Jack Bond ray' is Bonded Rye, not plain Bonded", () => {
    const { match } = matchProductWithNameNumber(index, parseUtterance("Jack Bond ray 0.25"));
    expect(match.best?.row.name).toBe("WHY JACK DANIELS BONDED RYE");
  });
});
