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
