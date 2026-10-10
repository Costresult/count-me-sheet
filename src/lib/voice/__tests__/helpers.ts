import type { ParsedSheet } from "@/lib/countme/types";
import { buildProductIndex } from "@/lib/voice/productIndex";
import { PRODUCT_FIXTURE } from "./fixtures";

export function fixtureSheet(): ParsedSheet {
  const col = (n: number, header: string, kind: "identity" | "other" | "count") => ({
    id: `c${n}`, colNumber: n, letter: "ABCD"[n - 1]!, header, kind, hidden: false, defaultWidth: 100,
  });
  return {
    name: "InventoryCounts",
    headerRowNumber: 1,
    mergedCount: 0,
    columns: [col(1, "Alt Grup", "identity"), col(2, "Stok Malı", "identity"), col(3, "Birim", "other"), col(4, "Sayım Miktarı", "count")],
    rows: PRODUCT_FIXTURE.map(([g, n, u], i) => ({
      id: `r${i + 2}`, rowNumber: i + 2, hidden: false,
      cells: { c1: { value: g }, c2: { value: n }, c3: { value: u }, c4: { value: null } },
    })),
  };
}

export const fixtureIndex = () => buildProductIndex(fixtureSheet());
