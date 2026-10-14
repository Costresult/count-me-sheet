import { beforeEach, describe, expect, it, vi } from "vitest";
import ExcelJS from "exceljs";

vi.mock("@/lib/voice/aliases", async (orig) => {
  const real = await orig<typeof import("@/lib/voice/aliases")>();
  return {
    ...real,
    learnAlias: vi.fn(async () => null),
    recordCorrection: vi.fn(async () => undefined),
    learnUnitCorrection: vi.fn(async () => undefined),
    listAliases: vi.fn(async () => []),
    listUnitCorrections: vi.fn(async () => []),
  };
});

import { cloudDocs } from "@/lib/countme/cloud";
import { flagVoiceLog, flushVoiceLog, voiceLogToCsv, type VoiceLogRecord } from "@/lib/voice/log";
import { useCountMe } from "@/lib/countme/store";
import { useVoice } from "@/lib/voice/store";
import { parseSheet } from "@/lib/countme/workbook";
import { derivePages } from "@/lib/countme/pages";
import { PRODUCT_FIXTURE } from "./fixtures";

const wait = (ms = 60) => new Promise((r) => setTimeout(r, ms));

function setup() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("InventoryCounts");
  ws.addRow(["Alt Grup", "Stok Malı", "Birim", "Sayım Miktarı"]);
  for (const r of PRODUCT_FIXTURE) ws.addRow([r[0], r[1], r[2], null]);
  const parsed = parseSheet(ws);
  useCountMe.setState({ parsed, pages: derivePages(parsed), edits: {}, formulas: {}, addedColumns: [], undoStack: [], status: "RUNNING" });
  useCountMe.getState().addCountColumn(1);
  useVoice.setState({ state: "LISTENING", prompt: null, aliases: [], corrections: [] });
  const rowOf = (name: string, unit: string) =>
    parsed.rows.find((r) => r.cells["c2"]?.value === name && r.cells["c3"]?.value === unit)!.id;
  const written = () =>
    Object.entries(useCountMe.getState().edits).map(([k, v]) => {
      const row = parsed.rows.find((r) => r.id === k.split("|")[0])!;
      return [`${row.cells["c2"]?.value}|${row.cells["c3"]?.value}`, v] as const;
    });
  return { rowOf, written };
}

describe("voice → sheet flow", () => {
  let t: ReturnType<typeof setup>;
  beforeEach(() => {
    t = setup();
  });

  it("writes 'barbare blush 8 şişe' to the ŞİŞE row", async () => {
    useVoice.getState().ingestTranscript("barbare blush 8 şişe");
    await wait();
    expect(t.written()).toEqual([["SR BARBARE BLUSH 75 CL|SISE 75 CL", 8]]);
  });

  it("offers the Barbare products for 'barbareros 8 şişe'", async () => {
    useVoice.getState().ingestTranscript("barbareros 8 şişe");
    await wait();
    const names = useVoice.getState().prompt?.options.map((o) => o.label) ?? [];
    expect(names.some((n) => n.includes("BARBARE BLUSH"))).toBe(true);
  });

  it("routes a picked LİTRE row to the ŞİŞE row when bottles were spoken", async () => {
    useVoice.getState().ingestTranscript("barbareros 8 şişe");
    await wait();
    await useVoice.getState().chooseRow(t.rowOf("SR BARBARE BLUSH 75 CL", "LITRE"));
    await wait();
    expect(t.written()).toEqual([["SR BARBARE BLUSH 75 CL|SISE 75 CL", 8]]);
  });

  it("writes 'chivas 13, 34 cl.' to LİTRE as 0.34", async () => {
    useVoice.getState().ingestTranscript("Chivas 13, 34 cl.");
    await wait();
    expect(t.written()).toEqual([["WHY CHIVAS 13 EXTRA|LITRE", 0.34]]);
  });
});

describe("voice log", () => {
  it("records heard + matched, heard + asked and the user's choice", async () => {
    const t = setup();
    const sent: VoiceLogRecord[] = [];
    vi.spyOn(cloudDocs, "putMany").mockImplementation(async (_s, values) => {
      sent.push(...(values as unknown as VoiceLogRecord[]));
    });
    await flushVoiceLog();
    sent.length = 0;

    useVoice.getState().ingestTranscript("barbare blush 8 şişe");
    await wait();
    useVoice.getState().ingestTranscript("barbareros 8 şişe");
    await wait();
    await useVoice.getState().chooseRow(t.rowOf("SR BARBARE BLUSH 75 CL", "LITRE"));
    await wait();
    await flushVoiceLog();

    const matched = sent.find((r) => r.kind === "matched");
    expect(matched).toMatchObject({ heard: "barbare blush 8 şişe", value: 8 });
    expect(matched?.suggested).toContain("SR BARBARE BLUSH 75 CL");

    const asked = sent.find((r) => r.kind === "asked");
    expect(asked).toMatchObject({ heard: "barbareros 8 şişe" });
    expect(asked?.candidates?.length).toBeGreaterThan(0);

    const chosen = sent.find((r) => r.kind === "chosen");
    expect(chosen).toMatchObject({ heard: "barbareros 8 şişe", value: 8 });
    expect(chosen?.chosen).toContain("BARBARE BLUSH");
    expect(chosen?.suggested).toBeTruthy();
  });

  it("writes a CSV Excel can open", () => {
    const csv = voiceLogToCsv([
      { id: "1", ts: 0, sessionId: null, kind: "unmatched", heard: "foo; bar", page: 1 },
    ]);
    expect(csv.startsWith("\ufeffZaman;Sonuç;Duyulan")).toBe(true);
    expect(csv).toContain('"foo; bar"');
  });
});

describe("adding to an occupied cell on the same page", () => {
  const cellOf = (t: ReturnType<typeof setup>, name: string, unit: string) => {
    const id = t.rowOf(name, unit);
    const st = useCountMe.getState();
    const col = st.pages.pageColumns[1]!;
    return { value: st.edits[`${id}|${col}`], formula: st.formulas[`${id}|${col}`] };
  };

  it.each([
    ["malibu nokta otuz dört", 0.54, "0.2+0.34"],
    ["artı nokta otuz dört", 0.54, "0.2+0.34"],
    ["+ nokta otuz dört", 0.54, "0.2+0.34"],
    ["malibu artı nokta otuz dört", 0.54, "0.2+0.34"],
  ])("'malibu nokta iki' then '%s' -> %d (=%s)", async (second, total, formula) => {
    const t = setup();
    useVoice.getState().ingestTranscript("malibu nokta iki");
    await wait();
    useVoice.getState().ingestTranscript(second);
    await wait();
    const cell = cellOf(t, "LQR MALIBU", "LITRE");
    expect(cell.value).toBeCloseTo(total, 6);
    expect(cell.formula).toBe(formula);
  });

  it("keeps adding: three readings become one formula", async () => {
    const t = setup();
    for (const s of ["malibu nokta iki", "malibu nokta bir", "artı nokta üç"]) {
      useVoice.getState().ingestTranscript(s);
      await wait();
    }
    const cell = cellOf(t, "LQR MALIBU", "LITRE");
    expect(cell.value).toBeCloseTo(0.6, 6);
    expect(cell.formula).toBe("0.2+0.1+0.3");
  });
});

describe("suspicious litre amount in the popup", () => {
  it("lists both readings and writes the one the user picks", async () => {
    const t = setup();
    useVoice.getState().ingestTranscript("ananas suyu 520 cel");
    await wait();
    const opts = useVoice.getState().prompt?.options ?? [];
    expect(opts.map((o) => o.value)).toEqual([5.2, 0.52]);
    await useVoice.getState().chooseCandidate(1);
    await wait();
    expect(t.written()).toEqual([["ANANAS SUYU LITRE|LITRE", 0.52]]);
  });
});

describe("multiplication", () => {
  const cell = (t: ReturnType<typeof setup>, name: string, unit: string) => {
    const id = t.rowOf(name, unit);
    const st = useCountMe.getState();
    const col = st.pages.pageColumns[1]!;
    return { value: st.edits[`${id}|${col}`], formula: st.formulas[`${id}|${col}`] };
  };

  it.each(["ananas suyu 18 litre çarpı 4", "ananas suyu 18 litre x 4 adet", "ananas suyu 18 litre çarpı 4 adet"])(
    "'%s' -> 72 litres (=18*4)",
    async (spoken) => {
      const t = setup();
      useVoice.getState().ingestTranscript(spoken);
      await wait();
      expect(cell(t, "ANANAS SUYU LITRE", "LITRE")).toEqual({ value: 72, formula: "18*4" });
    },
  );

  it("adds a calculated amount to an occupied cell as one formula", async () => {
    const t = setup();
    useVoice.getState().ingestTranscript("ananas suyu 5 litre");
    await wait();
    useVoice.getState().ingestTranscript("ananas suyu 18 litre çarpı 4");
    await wait();
    expect(cell(t, "ANANAS SUYU LITRE", "LITRE")).toEqual({ value: 77, formula: "5+18*4" });
  });
});

describe("a number without a product", () => {
  const edits = () => Object.values(useCountMe.getState().edits);

  it("adds to the product just written when said within 5 seconds", async () => {
    const t = setup();
    const real = Date.now.bind(Date);
    let offset = 0;
    const spy = vi.spyOn(Date, "now").mockImplementation(() => real() + offset);
    try {
      useVoice.getState().ingestTranscript("malibu nokta iki");
      await wait();
      offset = 3000;
      useVoice.getState().ingestTranscript("nokta bir");
      await wait();
      expect(edits()).toEqual([0.3]);
      expect(t.written()).toEqual([["LQR MALIBU|LITRE", 0.3]]);
    } finally {
      spy.mockRestore();
    }
  });

  it("writes nothing after 5 seconds, even though the cell is still selected", async () => {
    const t = setup();
    const real = Date.now.bind(Date);
    let offset = 0;
    const spy = vi.spyOn(Date, "now").mockImplementation(() => real() + offset);
    try {
      useVoice.getState().ingestTranscript("malibu nokta iki");
      await wait();
      useCountMe.getState().focusProductRow(t.rowOf("LQR MALIBU", "LITRE"));
      offset = 6000;
      useVoice.getState().ingestTranscript("nokta bir");
      await wait();
      useVoice.getState().ingestTranscript("artı nokta bir");
      await wait();
      expect(edits()).toEqual([0.2]);
    } finally {
      spy.mockRestore();
    }
  });
});

describe("sum then multiply, end to end", () => {
  it("writes (2 kg + 350 g) × 6 as 14.1 kg and keeps the calculation", async () => {
    const t = setup();
    useVoice.getState().ingestTranscript("badem kavrulmus 2 kilo 350 gram çarpı 6 adet");
    await wait();
    const id = t.rowOf("BADEM KAVRULMUS", "KILOGRAM");
    const st = useCountMe.getState();
    const col = st.pages.pageColumns[1]!;
    expect(st.edits[`${id}|${col}`]).toBeCloseTo(14.1, 6);
    expect(st.formulas[`${id}|${col}`]).toBe("(2+0.35)*6");
  });
});

describe("flagging an entry for a fix", () => {
  it("stores the note on the same record the entry was logged as", async () => {
    setup();
    const store = new Map<string, unknown>();
    vi.spyOn(cloudDocs, "putMany").mockImplementation(async (_s, values) => {
      for (const v of values as unknown as VoiceLogRecord[]) store.set(v.id, v);
    });
    vi.spyOn(cloudDocs, "get").mockImplementation(async (_s, id) => store.get(id));
    vi.spyOn(cloudDocs, "put").mockImplementation(async (_s, v) => {
      store.set((v as { id: string }).id, v);
    });

    useVoice.getState().ingestTranscript("badem kavrulmus 2 kilo 350 gram çarpı 6 adet");
    await wait();
    const entry = useVoice.getState().entries[0]!;
    expect(await flagVoiceLog(entry.id, "14,1 yazmalıydı")).toBe(true);

    const rec = store.get(entry.id) as VoiceLogRecord;
    expect(rec).toMatchObject({ heard: "badem kavrulmus 2 kilo 350 gram çarpı 6 adet", kind: "matched" });
    expect(rec.flag?.note).toBe("14,1 yazmalıydı");
    expect(voiceLogToCsv([rec])).toContain("DÜZELT: 14,1 yazmalıydı");
  });

  it("fails visibly when the record cannot be read", async () => {
    setup();
    vi.spyOn(cloudDocs, "putMany").mockImplementation(async () => undefined);
    vi.spyOn(cloudDocs, "get").mockRejectedValue(new Error("offline"));
    useVoice.getState().ingestTranscript("badem kavrulmus nokta iki");
    await wait();
    await expect(flagVoiceLog(useVoice.getState().entries[0]!.id, "")).rejects.toThrow("offline");
  });
});
