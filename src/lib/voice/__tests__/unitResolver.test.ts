import { describe, expect, it } from "vitest";
import { matchProductWithNameNumber } from "@/lib/voice/matcher";
import { parseUtterance } from "@/lib/voice/parser";
import { resolveDestination } from "@/lib/voice/unitResolver";
import { fixtureIndex } from "./helpers";

const index = fixtureIndex();

function route(spoken: string) {
  const { match, utterance } = matchProductWithNameNumber(index, parseUtterance(spoken));
  const rows = index.filter((r) => r.groupKey === match.best!.row.groupKey);
  const d = resolveDestination(rows, utterance);
  const unitOf = (id: string) => index.find((r) => r.rowId === id)!.unitText;
  return {
    d,
    writes: d.writes.map((w) => [unitOf(w.rowId), w.value] as const),
    options: d.options.map((o) => [o.row.unitText, o.value] as const),
  };
}

describe("unit routing on the September workbook", () => {
  it("writes a spoken fraction to the LİTRE row", () => {
    expect(route("malibu nokta iki").writes).toEqual([["LIKOR LITRE", 0.2]]);
    expect(route("jack daniels apple nokta beş").writes).toEqual([["WHISKY LITRE", 0.5]]);
  });

  it("writes a spoken fraction to the KİLOGRAM row", () => {
    expect(route("badem nokta beş").writes).toEqual([["CEREZ KILOGRAM", 0.5]]);
  });

  it("writes bottles to the only bottle row", () => {
    expect(route("malibu 1 şişe").writes).toEqual([["LIKOR SISE 70 CL", 1]]);
  });

  it("converts gram→kg and cl→litre automatically", () => {
    expect(route("badem elli gram").writes).toEqual([["CEREZ KILOGRAM", 0.05]]);
    expect(route("malibu yarım cl").writes).toEqual([["LIKOR LITRE", 0.005]]);
  });

  it("writes packages and cases to their own rows", () => {
    expect(route("becks 2 koli").writes).toEqual([["BIRA SISE KOLI 24 ADET", 2]]);
    expect(route("adaçayı taze 2 paket").writes).toEqual([["SEBZELER TAZE PAKET 25 GR", 2]]);
  });

  it("proposes the bottle size on the LİTRE row when there is no bottle row", () => {
    const r = route("jack daniels bonded 1 şişe");
    expect(r.writes).toEqual([]);
    expect(r.options).toEqual([["WHISKY LITRE", 0.7]]);
  });

  it("asks instead of guessing when there is no row for a package unit", () => {
    expect(route("becks 12").writes).toEqual([]);
  });
});

describe("lost or misheard centilitre unit", () => {
  it.each(["deacon 42 sl", "deacon 42 santil", "deacon 42 si el", "deacon 42 cel"])(
    "%s -> 0.42 on the LİTRE row",
    (s) => {
      expect(route(s).writes).toEqual([["WHISKY LITRE", 0.42]]);
    },
  );

  it("does not write a bare 42 as 42 litres; proposes 0.42 instead", () => {
    const r = route("deacon 42");
    expect(r.writes).toEqual([]);
    expect(r.options).toEqual([["WHISKY LITRE", 0.42]]);
  });
});

describe("several measures in one sentence", () => {
  it.each([
    ["badem 1 kilo 500 gram", 1.5],
    ["badem bir kilo beşyüz gram", 1.5],
    ["badem bir kilo beş yüz gram", 1.5],
    ["badem 2 kilo 250 gram", 2.25],
  ])("%s -> %d kg", (s, kg) => {
    expect(route(s).writes).toEqual([["CEREZ KILOGRAM", kg]]);
  });

  it("adds litres and centilitres", () => {
    expect(route("ananas suyu 2 litre 50 cl").writes).toEqual([["MESRUBAT LITRE", 2.5]]);
  });
});
