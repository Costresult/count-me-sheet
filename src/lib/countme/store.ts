import { create } from "zustand";
import { loadSession, saveSession, clearSession } from "./storage";
import { exportWithEdits, loadWorkbook, parseSheet } from "./workbook";
import {
  editKey,
  type ParsedSheet,
  type SessionStatus,
  type SheetColumn,
  type StoredSession,
  type ViewPrefs,
} from "./types";

export const DEFAULT_ROW_HEIGHT = 34;

export interface FocusTarget {
  rowId: string;
  columnId: string | null;
  token: number;
}

interface UndoEntry {
  rowId: string;
  columnId: string;
  previous: number | null | undefined;
}

interface CountMeState {
  fileName: string | null;
  originalFile: ArrayBuffer | null;
  sheetNames: string[];
  sheetName: string | null;
  parsed: ParsedSheet | null;
  edits: Record<string, number | null>;
  view: ViewPrefs;
  status: SessionStatus;
  busy: boolean;
  error: string | null;
  focus: FocusTarget | null;
  undoStack: UndoEntry[];
  savedAt: number | null;

  restore: () => Promise<void>;
  uploadFile: (file: File) => Promise<void>;
  selectSheet: (name: string) => Promise<void>;
  setStatus: (status: SessionStatus) => void;
  userInterrupt: () => void;

  writeInventoryValue: (rowId: string, columnId: string, value: number | null) => void;
  clearInventoryValue: (rowId: string, columnId: string) => void;
  undoLast: () => void;

  focusProductRow: (rowId: string) => void;
  focusCell: (rowId: string, columnId: string) => void;
  clearFocus: (token: number) => void;

  setColumnWidth: (columnId: string, width: number) => void;
  setColumnWidths: (widths: Record<string, number>) => void;
  setRowHeight: (height: number) => void;
  resetView: () => void;

  exportFile: () => Promise<void>;
  resetSession: () => Promise<void>;
}

const emptyView = (): ViewPrefs => ({ columnWidths: {}, rowHeight: DEFAULT_ROW_HEIGHT });

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let focusToken = 0;

export const useCountMe = create<CountMeState>((set, get) => {
  const persist = (immediate = false) => {
    const run = async () => {
      const s = get();
      if (!s.originalFile || !s.fileName) return;
      const session: StoredSession = {
        id: "active",
        fileName: s.fileName,
        originalFile: s.originalFile,
        sheetName: s.sheetName,
        status: s.status,
        edits: s.edits,
        view: s.view,
        updatedAt: Date.now(),
      };
      await saveSession(session);
      set({ savedAt: Date.now() });
    };
    if (immediate) {
      void run();
      return;
    }
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => void run(), 400);
  };

  const openSheet = async (buffer: ArrayBuffer, name: string) => {
    const wb = await loadWorkbook(buffer);
    const ws = wb.getWorksheet(name);
    if (!ws) throw new Error("Çalışma sayfası okunamadı");
    return parseSheet(ws);
  };

  return {
    fileName: null,
    originalFile: null,
    sheetNames: [],
    sheetName: null,
    parsed: null,
    edits: {},
    view: emptyView(),
    status: "IDLE",
    busy: false,
    error: null,
    focus: null,
    undoStack: [],
    savedAt: null,

    restore: async () => {
      try {
        const session = await loadSession();
        if (!session) return;
        set({ busy: true });
        const wb = await loadWorkbook(session.originalFile);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const names = wb.worksheets.map((ws: any) => ws.name as string);
        const sheetName = session.sheetName ?? names[0] ?? null;
        const parsed = sheetName ? parseSheet(wb.getWorksheet(sheetName)) : null;
        set({
          fileName: session.fileName,
          originalFile: session.originalFile,
          sheetNames: names,
          sheetName,
          parsed,
          edits: session.edits ?? {},
          view: session.view ?? emptyView(),
          status: session.status === "RUNNING" ? "PAUSED" : session.status,
          busy: false,
          savedAt: session.updatedAt,
        });
      } catch (e) {
        set({ busy: false, error: (e as Error).message });
      }
    },

    uploadFile: async (file) => {
      set({ busy: true, error: null });
      try {
        const buffer = await file.arrayBuffer();
        const wb = await loadWorkbook(buffer);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const names: string[] = wb.worksheets.map((ws: any) => ws.name as string);
        if (names.length === 0) throw new Error("Çalışma kitabında sayfa bulunamadı");
        const sheetName = names[0]!;
        const parsed = parseSheet(wb.getWorksheet(sheetName));
        set({
          fileName: file.name,
          originalFile: buffer,
          sheetNames: names,
          sheetName,
          parsed,
          edits: {},
          undoStack: [],
          view: emptyView(),
          status: "IDLE",
          busy: false,
        });
        persist(true);
      } catch (e) {
        set({ busy: false, error: `Dosya okunamadı: ${(e as Error).message}` });
      }
    },

    selectSheet: async (name) => {
      const { originalFile } = get();
      if (!originalFile) return;
      set({ busy: true });
      try {
        const parsed = await openSheet(originalFile, name);
        set({ sheetName: name, parsed, busy: false, view: emptyView() });
        persist(true);
      } catch (e) {
        set({ busy: false, error: (e as Error).message });
      }
    },

    setStatus: (status) => {
      set({ status });
      persist();
    },

    userInterrupt: () => {
      if (get().status === "RUNNING") {
        set({ status: "PAUSED_BY_USER" });
        persist();
      }
    },

    writeInventoryValue: (rowId, columnId, value) => {
      const { edits, parsed, undoStack } = get();
      const col = parsed?.columns.find((c) => c.id === columnId);
      if (!col || col.kind === "total") return;
      const key = editKey(rowId, columnId);
      const next = { ...edits, [key]: value };
      set({
        edits: next,
        undoStack: [...undoStack, { rowId, columnId, previous: edits[key] }].slice(-200),
      });
      get().focusCell(rowId, columnId);
      persist();
    },

    clearInventoryValue: (rowId, columnId) => {
      get().writeInventoryValue(rowId, columnId, null);
    },

    undoLast: () => {
      const { undoStack, edits } = get();
      const last = undoStack[undoStack.length - 1];
      if (!last) return;
      const key = editKey(last.rowId, last.columnId);
      const next = { ...edits };
      if (last.previous === undefined) delete next[key];
      else next[key] = last.previous;
      set({ edits: next, undoStack: undoStack.slice(0, -1) });
      get().focusCell(last.rowId, last.columnId);
      persist();
    },

    focusProductRow: (rowId) => {
      focusToken += 1;
      set({ focus: { rowId, columnId: null, token: focusToken } });
    },

    focusCell: (rowId, columnId) => {
      focusToken += 1;
      set({ focus: { rowId, columnId, token: focusToken } });
    },

    clearFocus: (token) => {
      const f = get().focus;
      if (f && f.token === token) set({ focus: null });
    },

    setColumnWidth: (columnId, width) => {
      const view = get().view;
      set({
        view: {
          ...view,
          columnWidths: { ...view.columnWidths, [columnId]: Math.max(48, Math.round(width)) },
        },
      });
      persist();
    },

    setColumnWidths: (widths) => {
      const view = get().view;
      set({ view: { ...view, columnWidths: { ...view.columnWidths, ...widths } } });
      persist();
    },

    setRowHeight: (height) => {
      const view = get().view;
      set({ view: { ...view, rowHeight: Math.min(72, Math.max(24, Math.round(height))) } });
      persist();
    },

    resetView: () => {
      set({ view: emptyView() });
      persist();
    },

    exportFile: async () => {
      const { originalFile, sheetName, parsed, edits, fileName } = get();
      if (!originalFile || !sheetName || !parsed) return;
      set({ busy: true });
      try {
        const blob = await exportWithEdits(originalFile, sheetName, parsed, edits);
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        const base = (fileName ?? "envanter").replace(/\.xlsx?$/i, "");
        a.download = `${base}-countme.xlsx`;
        a.click();
        URL.revokeObjectURL(url);
        set({ busy: false, status: "COMPLETED" });
        persist(true);
      } catch (e) {
        set({ busy: false, error: (e as Error).message });
      }
    },

    resetSession: async () => {
      await clearSession();
      set({
        fileName: null,
        originalFile: null,
        sheetNames: [],
        sheetName: null,
        parsed: null,
        edits: {},
        undoStack: [],
        view: emptyView(),
        status: "IDLE",
        focus: null,
        savedAt: null,
      });
    },
  };
});

export const columnWidth = (view: ViewPrefs, col: SheetColumn) =>
  view.columnWidths[col.id] ?? col.defaultWidth;