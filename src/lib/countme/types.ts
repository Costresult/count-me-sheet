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
  formula?: string | undefined;
  numFmt?: string | undefined;
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
  id: string;
  name: string;
  fileName: string;
  originalFile: ArrayBuffer;
  sheetName: string | null;
  status: SessionStatus;
  edits: Record<string, number | null>;
  view: ViewPrefs;
  createdAt: number;
  updatedAt: number;
}

export interface SessionMeta {
  id: string;
  name: string;
  fileName: string;
  sheetName: string | null;
  status: SessionStatus;
  editCount: number;
  createdAt: number;
  updatedAt: number;
}

export const statusLabels: Record<SessionStatus, string> = {
  IDLE: "Hazır",
  RUNNING: "Devam Ediyor",
  PAUSED: "Duraklatıldı",
  PAUSED_BY_USER: "Duraklatıldı",
  COMPLETED: "Tamamlandı",
};

export const editKey = (rowId: string, columnId: string) => `${rowId}|${columnId}`;