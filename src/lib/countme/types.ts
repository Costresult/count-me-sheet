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
  /** Column that does not exist in the original workbook yet; created for extra physical pages. */
  virtual?: boolean;
}

/** A count column the user added on top of the original workbook structure. */
export interface AddedColumn {
  id: string;
  header: string;
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

/** Physical counting page -> Excel count column mapping (page numbers are 1-based). */
export type PageColumnMap = Record<number, string | null>;

export interface PageState {
  activePage: number;
  pageCount: number;
  pageColumns: PageColumnMap;
  lastActiveRow: string | null;
}

export const emptyPages = (): PageState => ({
  activePage: 1,
  pageCount: 1,
  pageColumns: {},
  lastActiveRow: null,
});

export interface StoredSession {
  id: string;
  name: string;
  fileName: string;
  originalFile: ArrayBuffer;
  sheetName: string | null;
  status: SessionStatus;
  edits: Record<string, number | null>;
  view: ViewPrefs;
  pages?: PageState;
  addedColumns?: AddedColumn[];
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