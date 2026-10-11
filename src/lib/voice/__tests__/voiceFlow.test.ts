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
import { flushVoiceLog, voiceLogToCsv, type VoiceLogRecord } from "@/lib/voice/log";
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
