export type CellValue = string | number | boolean | null;

export type ColumnKind = "identity" | "count" | "total" | "other";

export interface SheetColumn {
  id: string;
  colNumber: number;
  letter: string;
  header: string;
  kind: ColumnKind;
  hidden: boolean;
  defaultWidth: number;
}

export interface SheetCell {
  value: CellValue;
  formula?: string;
  numFmt?: string;
}

export interface SheetRow {
  id: string;
  rowNumber: number;
  hidden: boolean;
  cells: Record<string, SheetCell>;
}

export interface ParsedSheet {
  name: string;
  headerRowNumber: number;
  columns: SheetColumn[];
  rows: SheetRow[];
  mergedCount: number;
}

export interface WorkbookSummary {
  fileName: string;
  sheetNames: string[];
}

export type SessionStatus = "IDLE" | "RUNNING" | "PAUSED" | "PAUSED_BY_USER" | "COMPLETED";

export interface ViewPrefs {
  columnWidths: Record<string, number>;
  rowHeight: number;
}

export interface StoredSession {
  id: "active";
  fileName: string;
  originalFile: ArrayBuffer;
  sheetName: string | null;
  status: SessionStatus;
  edits: Record<string, number | null>;
  view: ViewPrefs;
  updatedAt: number;
}

export const editKey = (rowId: string, columnId: string) => `${rowId}|${columnId}`;