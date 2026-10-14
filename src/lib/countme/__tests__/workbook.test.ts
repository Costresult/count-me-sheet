import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { appendReading } from "@/lib/countme/calc";
import { exportWithEdits, parseSheet, withAddedColumns } from "@/lib/countme/workbook";
import { editKey } from "@/lib/countme/types";

async function simpraWorkbook(): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("InventoryCounts");
  ws.addRow(["Alt Grup", "Stok Malı", "Birim", "Sayım Miktarı"]);
  ws.addRow(["LIKOR", "LQR MALIBU", "LITRE", null]);
  ws.addRow(["LIKOR", "LQR MALIBU", "SISE 70 CL", null]);
  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}

async function load(buffer: ArrayBuffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  return wb.getWorksheet("InventoryCounts")!;
}

describe("appendReading", () => {
  it("builds formula bodies", () => {
    expect(appendReading(undefined, 0.2, 0.34)).toBe("0.2+0.34");
    expect(appendReading("0.2+0.34", 0.54, 0.1)).toBe("0.2+0.34+0.1");
    expect(appendReading(undefined, 6, 10)).toBe("6+10");
  });
});

describe("Simpra layout export", () => {
  it("treats an empty 'Sayım Miktarı' column as the total", async () => {
    const buf = await simpraWorkbook();
    const parsed = parseSheet(await load(buf));
    expect(parsed.columns.find((c) => c.header === "Sayım Miktarı")?.kind).toBe("total");
  });

  it("puts the total in D and the pages in E, F with formulas for repeated readings", async () => {
    const buf = await simpraWorkbook();
    const added = [
      { id: "v1", header: "Sayım 1" },
      { id: "v2", header: "Sayım 2" },
    ];
    const parsed = withAddedColumns(parseSheet(await load(buf)), added)!;
    const malibuLitre = parsed.rows[0]!.id;
    const edits = {
      [editKey(malibuLitre, "v1")]: 0.54,
      [editKey(malibuLitre, "v2")]: 0.1,
    };
    const formulas = { [editKey(malibuLitre, "v1")]: "0.2+0.34" };
    const out = await exportWithEdits(buf, "InventoryCounts", parsed, edits, added, [], formulas);
    const ws = await load(await out.blob.arrayBuffer());

    expect(ws.getCell("A2").value).toBe("LIKOR");
    expect(ws.getCell("B2").value).toBe("LQR MALIBU");
    expect(ws.getCell("D1").value).toBe("Sayım Miktarı");
    expect(ws.getCell("E1").value).toBe("Sayım 1");
    expect(ws.getCell("F1").value).toBe("Sayım 2");
    expect(ws.getCell("E2").value).toMatchObject({ formula: "0.2+0.34" });
    expect(ws.getCell("E2").font?.color?.argb).toBe("FFDC2626");
    expect(ws.getCell("F2").font?.color?.argb).not.toBe("FFDC2626");
    expect(ws.getCell("F2").value).toBe(0.1);
    expect(ws.getCell("D2").value).toMatchObject({ formula: "SUM(E2:F2)" });
    expect(ws.getCell("D3").value).toMatchObject({ formula: "SUM(E3:F3)" });
  });
});

describe("recognizing the 'Sayım Miktarı' column", () => {
  async function sheetWith(headers: (string | null)[], rows: unknown[][] = [["A", "B", "KILOGRAM", null]]) {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("InventoryCounts");
    ws.addRow(headers);
    rows.forEach((r) => ws.addRow(r));
    return parseSheet(ws);
  }
  const kinds = (p: ReturnType<typeof parseSheet>) => p.columns.map((c) => c.kind);

  it.each(["Sayım Miktarı", "SAYIM MİKTARI", "SAYIM MIKTARI", "Sayim Miktari", "Sayım Miktarı", "Sayı̇m Miktarı", " sayım  miktarı "])(
    "treats %j as the total column",
    async (header) => {
      const p = await sheetWith(["Alt Grup", "Stok Malı", "Birim", header]);
      expect(kinds(p)).toEqual(["identity", "identity", "identity", "total"]);
    },
  );

  it("still treats it as the total when the sheet has other empty count columns", async () => {
    const p = await sheetWith(["Alt Grup", "Stok Malı", "Birim", "Sayım Miktarı", null], [["A", "B", "KILOGRAM", null, 2]]);
    expect(kinds(p)).toEqual(["identity", "identity", "identity", "total", "count"]);
  });

  it("does not turn an ordinary count column into a total", async () => {
    const p = await sheetWith(["Alt Grup", "Stok Malı", "Birim", "Sayım 1"]);
    expect(kinds(p)).toEqual(["identity", "identity", "identity", "count"]);
  });
});

describe("'Sayım Miktarı' filled with dashes (the 34-3 MUT&SARF list)", () => {
  async function dashed() {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("InventoryCounts");
    ws.addRow(["Alt Grup", "Stok Malı", "Birim", "Sayım Miktarı"]);
    for (let i = 0; i < 20; i++) ws.addRow(["SEBZELER TAZE", `URUN ${i}`, "KILOGRAM", "-"]);
    return { buffer: (await wb.xlsx.writeBuffer()) as ArrayBuffer, parsed: parseSheet(ws) };
  }

  it("is still the total column", async () => {
    const { parsed } = await dashed();
    expect(parsed.columns.map((c) => c.kind)).toEqual(["identity", "identity", "identity", "total"]);
  });

  it("keeps the list's product columns and sums the pages in D on export", async () => {
    const { buffer, parsed } = await dashed();
    const added = [
      { id: "v1", header: "Sayım 1" },
      { id: "v2", header: "Sayım 2" },
      { id: "v3", header: "Sayım 3" },
    ];
    const withPages = withAddedColumns(parsed, added)!;
    const rowId = withPages.rows[0]!.id;
    const edits = { [editKey(rowId, "v1")]: 1, [editKey(rowId, "v2")]: 2.5, [editKey(rowId, "v3")]: 3 };
    const out = await exportWithEdits(buffer, "InventoryCounts", withPages, edits, added, [], {});
    const ws = await load(await out.blob.arrayBuffer());
    expect(ws.getCell("D2").value).toMatchObject({ formula: "SUM(E2:G2)", result: 6.5 });
    expect(ws.getCell("D3").value).toMatchObject({ formula: "SUM(E3:G3)" });
    expect(ws.getCell("E1").value).toBe("Sayım 1");
    expect(ws.getCell("G1").value).toBe("Sayım 3");
  });

  it("does not make a bare 'Miktar' text column a total", async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("InventoryCounts");
    ws.addRow(["Alt Grup", "Stok Malı", "Birim", "Miktar"]);
    for (let i = 0; i < 5; i++) ws.addRow(["A", `U${i}`, "KG", "-"]);
    expect(parseSheet(ws).columns[3]!.kind).toBe("identity");
  });
});
