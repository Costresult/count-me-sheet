import { parseUtterance } from "@/lib/voice/parser";
import { buildProductIndex } from "@/lib/voice/productIndex";
import { matchProduct } from "@/lib/voice/matcher";
import { resolveUnitDestination } from "@/lib/voice/unitResolver";
import { parseCommand } from "@/lib/voice/commands";
import type { ParsedSheet } from "@/lib/countme/types";

const products: [string, string][] = [
  ["JOHNNIE WALKER BLUE LABEL", "LİTRE"],
  ["CHIVAS REGAL 12", "LİTRE"],
  ["CHIVAS REGAL 18", "ŞİŞE 70 CL"],
  ["DOM PERIGNON", "ŞİŞE 75 CL"],
  ["MONKEY 47", "ŞİŞE 50 CL"],
  ["JOHNNIE WALKER RED LABEL", "ŞİŞE 70 CL"],
  ["JACK DANIEL'S ORIGINAL", "LİTRE"],
  ["JACK DANIEL'S HONEY", "LİTRE"],
  ["GENTLEMAN JACK", "ŞİŞE 70 CL"],
  ["WOODFORD RYE", "LİTRE"],
  ["WOODFORD RESERVE", "LİTRE"],
  ["BELVEDERE", "LİTRE"],
  ["MALIBU", "LİTRE"],
  ["MATCHA", "GRAM"],
  ["CORONA", "KOLİ 24 ADET"],
  ["GIN SKAGERRAK NORDIC", "ŞİŞE 70 CL"],
  ["GIN FORTE", "ŞİŞE 70 CL"],
  ["DONDURMA KARADUT", "KG"],
  ["DOMATES TAZE", "KG"],
  ["BEYLERBEYİ GÖBEK", "ŞİŞE 70 CL"],
  ["GIMMARE", "LİTRE"],
];

const parsed: ParsedSheet = {
  name: "Sheet1",
  headerRowNumber: 1,
  columns: [
    { id: "c1", colNumber: 1, letter: "A", header: "ÜRÜN", kind: "identity", hidden: false, defaultWidth: 200 },
    { id: "c2", colNumber: 2, letter: "B", header: "BİRİM", kind: "identity", hidden: false, defaultWidth: 100 },
    { id: "c3", colNumber: 3, letter: "C", header: "SAYIM 1", kind: "count", hidden: false, defaultWidth: 80 },
  ],
  rows: products.map(([n, u], i) => ({
    id: `r${i + 2}`,
    rowNumber: i + 2,
    hidden: false,
    cells: { c1: { value: n }, c2: { value: u }, c3: { value: null } },
  })),
  mergedCount: 0,
};

const index = buildProductIndex(parsed);
const nameOf = (id: string) => index.find((r) => r.rowId === id)?.label ?? id;

const cases: [string, string][] = [
  ["Blue Label 65 CL", "JOHNNIE WALKER BLUE LABEL | LİTRE = 0.65"],
  ["Chivas Regal 70 CL artı 25 CL", "MEDIUM-CANDIDATES"],
  ["Dom Perignon 75 CL", "DOM PERIGNON | ŞİŞE 75 CL = 1"],
  ["Monkey 47 bir şişe", "MONKEY 47 | ŞİŞE 50 CL = 1"],
  ["Red Label bir şişe", "JOHNNIE WALKER RED LABEL | ŞİŞE 70 CL = 1"],
  ["Jack Daniels Honey 70 CL", "JACK DANIEL'S HONEY | LİTRE = 0.7"],
  ["Chivas Regal 18 bir şişe", "CHIVAS REGAL 18 | ŞİŞE 70 CL = 1"],
  ["Gentleman Jack 70'likten 4 şişe", "GENTLEMAN JACK | ŞİŞE 70 CL = 4"],
  ["Woodford Rye 60 CL", "WOODFORD RYE | LİTRE = 0.6"],
  ["Woodford Reserve 70 CL", "WOODFORD RESERVE | LİTRE = 0.7"],
  ["Belvedere 1.40", "BELVEDERE | LİTRE = 1.4"],
  ["Belvedere 140 CL artı 65 CL", "BELVEDERE | LİTRE = 2.05"],
  ["Malibu 120 CL", "MALIBU | LİTRE = 1.2"],
  ["Matcha 150 gram", "MATCHA | GRAM = 150"],
  ["Corona 24 adet çarpı 3 koli", "CORONA | KOLİ 24 ADET = 3"],
  ["Skagerrak bir şişe", "GIN SKAGERRAK NORDIC | ŞİŞE 70 CL = 1"],
  ["karadut dondurma 2 kg", "DONDURMA KARADUT | KG = 2"],
  ["domates 5 kg", "DOMATES TAZE | KG = 5"],
  ["Beylerbeyi Göbek 70'lik 12 adet", "BEYLERBEYİ GÖBEK | ŞİŞE 70 CL = 12"],
  ["Gimmare 70 CL", "GIMMARE | LİTRE = 0.7"],
  ["Jack Daniels 20 CL", "MEDIUM-CANDIDATES"],
];

let pass = 0;
for (const [text, expect] of cases) {
  const u = parseUtterance(text);
  const m = matchProduct(index, u.productText);
  let got = "";
  if (!m.best || m.confidence !== "HIGH") {
    got = m.confidence === "MEDIUM" ? "MEDIUM-CANDIDATES" : `${m.confidence}: ${m.candidates.slice(0, 3).map((c) => `${c.row.name}(${c.score.toFixed(2)})`).join(", ")}`;
  } else {
    const rows = index.filter((r) => r.groupKey === m.best!.row.groupKey);
    const res = resolveUnitDestination(rows, u);
    got = res.writes.map((w) => `${nameOf(w.rowId)} = ${w.value}`).join(" · ") || `AMBIG(${res.reason})`;
  }
  const ok = got === expect;
  if (ok) pass++;
  console.log(`${ok ? "PASS" : "FAIL"} | "${text}" -> ${got}${ok ? "" : `   (expected ${expect})`} [product="${u.productText}"]`);
}
console.log(`\n${pass}/${cases.length} passed`);

// ambiguity
const jack = parseUtterance("Jack bir şişe");
const jm = matchProduct(index, jack.productText);
console.log("AMBIG Jack ->", jm.confidence, jm.candidates.slice(0, 4).map((c) => `${c.row.name}(${c.score.toFixed(2)})`).join(", "));

// learned alias
const alias = [{ id: "a", spokenAlias: "ginfort", normalizedAlias: "ginfort", targetProductIdentity: "gin forte", targetProductName: "GIN FORTE", targetUnit: null, correctionCount: 1, lastUsed: Date.now(), confidence: 0.45, source: "USER_SELECTION" as const }];
const g1 = matchProduct(index, "ginfort");
const g2 = matchProduct(index, "ginfort", alias);
console.log("ginfort no-alias:", g1.confidence, g1.best?.row.name, g1.best?.score.toFixed(2));
console.log("ginfort alias:", g2.confidence, g2.best?.row.name, g2.best?.score.toFixed(2));

// commands
for (const c of ["Bekle", "Dur", "Devam", "Sonraki sayfa", "Önceki sayfa", "Sayfa iki", "Geri al", "ikincisi", "Monkey 47 bir şişe"])
  console.log("CMD", JSON.stringify(c), "->", JSON.stringify(parseCommand(c)));
