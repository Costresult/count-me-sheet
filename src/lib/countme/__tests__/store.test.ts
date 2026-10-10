import { beforeEach, describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { useCountMe } from "@/lib/countme/store";
import { parseSheet } from "@/lib/countme/workbook";
import { derivePages } from "@/lib/countme/pages";
import { editKey } from "@/lib/countme/types";

async function loadSimpra() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("InventoryCounts");
  ws.addRow(["Alt Grup", "Stok Malı", "Birim", "Sayım Miktarı"]);
  ws.addRow(["LIKOR", "LQR MALIBU", "LITRE", null]);
  const parsed = parseSheet(ws);
  useCountMe.setState({ parsed, pages: derivePages(parsed), edits: {}, formulas: {}, addedColumns: [], undoStack: [] });
  return parsed;
}

describe("page writes", () => {
  beforeEach(async () => {
    await loadSimpra();
  });

  it("creates the page column on first write and keeps repeated readings as a formula", () => {
    const s = useCountMe.getState();
    const rowId = s.parsed!.rows[0]!.id;
    s.writePageValue(rowId, 1, 0.2, "VOICE_AI");
    const col = useCountMe.getState().pages.pageColumns[1]!;
    expect(col).toBeTruthy();
    expect(useCountMe.getState().edits[editKey(rowId, col)]).toBe(0.2);

    useCountMe.getState().writePageValue(rowId, 1, 0.34, "VOICE_AI");
    const st = useCountMe.getState();
    expect(st.edits[editKey(rowId, col)]).toBeCloseTo(0.54, 6);
    expect(st.formulas[editKey(rowId, col)]).toBe("0.2+0.34");

    useCountMe.getState().writePageValue(rowId, 1, 0.1, "VOICE_AI");
    expect(useCountMe.getState().formulas[editKey(rowId, col)]).toBe("0.2+0.34+0.1");
  });

  it("starts a new column for the next page", () => {
    const rowId = useCountMe.getState().parsed!.rows[0]!.id;
    useCountMe.getState().writePageValue(rowId, 1, 0.2, "VOICE_AI");
    useCountMe.getState().writePageValue(rowId, 2, 0.5, "VOICE_AI");
    const { pages, edits } = useCountMe.getState();
    expect(pages.pageColumns[1]).not.toBe(pages.pageColumns[2]);
    expect(edits[editKey(rowId, pages.pageColumns[2]!)]).toBe(0.5);
  });

  it("undo removes the last reading and its formula", () => {
    const rowId = useCountMe.getState().parsed!.rows[0]!.id;
    useCountMe.getState().writePageValue(rowId, 1, 0.2, "VOICE_AI");
    useCountMe.getState().writePageValue(rowId, 1, 0.34, "VOICE_AI");
    useCountMe.getState().undoLast();
    const st = useCountMe.getState();
    const col = st.pages.pageColumns[1]!;
    expect(st.edits[editKey(rowId, col)]).toBe(0.2);
    expect(st.formulas[editKey(rowId, col)]).toBeUndefined();
  });
});
