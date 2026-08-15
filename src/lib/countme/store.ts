import { create } from "zustand";
import {
  deleteSession as dbDelete,
  getActiveId,
  getSession,
  listSessions,
  renameSession as dbRename,
  saveSession,
  setActiveId,
} from "./storage";
import { exportWithEdits, loadWorkbook, parseSheet } from "./workbook";
import {
  editKey,
  type ParsedSheet,
  type SessionMeta,
  type SessionStatus,
  type SheetColumn,
  type StoredSession,
  type ViewPrefs,
} from "./types";

export const DEFAULT_ROW_HEIGHT = 34;

export type UploadPhase =
  | "idle"
  | "validating"
  | "reading"
  | "parsing"
  | "success"
  | "error";

export const uploadPhaseLabels: Record<UploadPhase, string | null> = {
  idle: null,
  validating: "Dosya kontrol ediliyor…",
  reading: "Dosya okunuyor…",
  parsing: "Excel okunuyor…",
  success: "Excel yüklendi",
  error: null,
};

const MAX_UPLOAD_BYTES = 40 * 1024 * 1024;

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
  sessions: SessionMeta[];
  activeId: string | null;

  fileName: string | null;
  name: string | null;
  createdAt: number | null;
  originalFile: ArrayBuffer | null;
  sheetNames: string[];
  sheetName: string | null;
  parsed: ParsedSheet | null;
  edits: Record<string, number | null>;
  view: ViewPrefs;
  status: SessionStatus;
  busy: boolean;
  error: string | null;
  uploadPhase: UploadPhase;
  focus: FocusTarget | null;
  undoStack: UndoEntry[];
  savedAt: number | null;
  sidebarOpen: boolean;

  init: () => Promise<void>;
  refreshSessions: () => Promise<void>;
  uploadFile: (file: File) => Promise<void>;
  openSession: (id: string) => Promise<void>;
  exitWorkspace: () => Promise<void>;
  exitApplication: () => Promise<void>;
  renameSession: (id: string, name: string) => Promise<void>;
  removeSession: (id: string) => Promise<void>;
  downloadSession: (id: string) => Promise<void>;
  selectSheet: (name: string) => Promise<void>;
  setStatus: (status: SessionStatus) => void;
  userInterrupt: () => void;
  setSidebarOpen: (open: boolean) => void;

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
}

const emptyView = (): ViewPrefs => ({ columnWidths: {}, rowHeight: DEFAULT_ROW_HEIGHT });

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let focusToken = 0;

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const outName = (name: string) => `${name.replace(/\.xls[xm]$/i, "")}-countme.xlsx`;

export const useCountMe = create<CountMeState>((set, get) => {
  const snapshot = (): StoredSession | null => {
    const s = get();
    if (!s.activeId || !s.originalFile || !s.fileName) return null;
    return {
      id: s.activeId,
      name: s.name ?? s.fileName,
      fileName: s.fileName,
      originalFile: s.originalFile,
      sheetName: s.sheetName,
      status: s.status,
      edits: s.edits,
      view: s.view,
      createdAt: s.createdAt ?? Date.now(),
      updatedAt: Date.now(),
    };
  };

  const flush = async () => {
    const session = snapshot();
    if (!session) return;
    await saveSession(session);
    set({ savedAt: session.updatedAt });
    await get().refreshSessions();
  };

  const persist = (immediate = false) => {
    if (saveTimer) clearTimeout(saveTimer);
    if (immediate) {
      void flush();
      return;
    }
    saveTimer = setTimeout(() => void flush(), 400);
  };

  const applySession = async (session: StoredSession) => {
    const wb = await loadWorkbook(session.originalFile);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const names: string[] = wb.worksheets.map((ws: any) => ws.name as string);
    const sheetName = session.sheetName ?? names[0] ?? null;
    const parsed = sheetName ? parseSheet(wb.getWorksheet(sheetName)) : null;
    set({
      activeId: session.id,
      name: session.name,
      fileName: session.fileName,
      createdAt: session.createdAt,
      originalFile: session.originalFile,
      sheetNames: names,
      sheetName,
      parsed,
      edits: session.edits ?? {},
      view: session.view ?? emptyView(),
      status: session.status === "RUNNING" ? "PAUSED" : session.status,
      undoStack: [],
      focus: null,
      busy: false,
      error: null,
      savedAt: session.updatedAt,
    });
    await setActiveId(session.id);
  };

  const clearActive = () =>
    set({
      activeId: null,
      name: null,
      fileName: null,
      createdAt: null,
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

  return {
    sessions: [],
    activeId: null,
    fileName: null,
    name: null,
    createdAt: null,
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
    sidebarOpen: false,

    refreshSessions: async () => {
      set({ sessions: await listSessions() });
    },

    init: async () => {
      try {
        await get().refreshSessions();
        const activeId = await getActiveId();
        if (!activeId) return;
        const session = await getSession(activeId);
        if (!session) return;
        set({ busy: true });
        await applySession(session);
      } catch (e) {
        set({ busy: false, error: (e as Error).message });
      }
    },

    uploadFile: async (file) => {
      set({ busy: true, error: null });
      try {
        if (!/\.(xlsx|xlsm)$/i.test(file.name)) {
          throw new Error("Desteklenmeyen dosya türü. Lütfen .xlsx veya .xlsm dosyası seçin.");
        }
        await flush(); // auto-save the session we are leaving
        const buffer = await file.arrayBuffer();
        const wb = await loadWorkbook(buffer);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const names: string[] = wb.worksheets.map((ws: any) => ws.name as string);
        if (names.length === 0) throw new Error("Çalışma kitabında sayfa bulunamadı");
        const now = Date.now();
        const session: StoredSession = {
          id: `s${now}-${Math.random().toString(36).slice(2, 7)}`,
          name: file.name.replace(/\.xls[xm]$/i, ""),
          fileName: file.name,
          originalFile: buffer,
          sheetName: names[0]!,
          status: "IDLE",
          edits: {},
          view: emptyView(),
          createdAt: now,
          updatedAt: now,
        };
        await saveSession(session);
        await applySession(session);
        set({ sidebarOpen: false });
        await get().refreshSessions();
      } catch (e) {
        set({ busy: false, error: (e as Error).message });
      }
    },

    openSession: async (id) => {
      if (get().activeId === id) {
        set({ sidebarOpen: false });
        return;
      }
      set({ busy: true, error: null });
      try {
        await flush();
        const session = await getSession(id);
        if (!session) throw new Error("Envanter bulunamadı");
        await applySession(session);
        set({ sidebarOpen: false });
        await get().refreshSessions();
      } catch (e) {
        set({ busy: false, error: (e as Error).message });
      }
    },

    exitWorkspace: async () => {
      await flush();
      await setActiveId(null);
      clearActive();
      await get().refreshSessions();
    },

    renameSession: async (id, name) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      if (get().activeId === id) {
        set({ name: trimmed });
        await flush();
      } else {
        await dbRename(id, trimmed);
      }
      await get().refreshSessions();
    },

    removeSession: async (id) => {
      await dbDelete(id);
      if (get().activeId === id) clearActive();
      await get().refreshSessions();
    },

    downloadSession: async (id) => {
      set({ busy: true, error: null });
      try {
        const current = get();
        let session = await getSession(id);
        if (current.activeId === id) {
          const live = snapshot();
          if (live) session = live;
        }
        if (!session || !session.sheetName) throw new Error("Envanter bulunamadı");
        const wb = await loadWorkbook(session.originalFile);
        const parsed = parseSheet(wb.getWorksheet(session.sheetName));
        const blob = await exportWithEdits(
          session.originalFile,
          session.sheetName,
          parsed,
          session.edits ?? {},
        );
        download(blob, outName(session.name || session.fileName));
        set({ busy: false });
      } catch (e) {
        set({ busy: false, error: (e as Error).message });
      }
    },

    selectSheet: async (name) => {
      const { originalFile } = get();
      if (!originalFile) return;
      set({ busy: true });
      try {
        const wb = await loadWorkbook(originalFile);
        const ws = wb.getWorksheet(name);
        if (!ws) throw new Error("Çalışma sayfası okunamadı");
        set({ sheetName: name, parsed: parseSheet(ws), busy: false, view: emptyView() });
        persist(true);
      } catch (e) {
        set({ busy: false, error: (e as Error).message });
      }
    },

    setStatus: (status) => {
      set({ status });
      persist(true);
    },

    userInterrupt: () => {
      if (get().status === "RUNNING") {
        set({ status: "PAUSED_BY_USER" });
        persist();
      }
    },

    setSidebarOpen: (open) => set({ sidebarOpen: open }),

    writeInventoryValue: (rowId, columnId, value) => {
      const { edits, parsed, undoStack, status } = get();
      const col = parsed?.columns.find((c) => c.id === columnId);
      if (!col || col.kind === "total") return;
      const key = editKey(rowId, columnId);
      set({
        edits: { ...edits, [key]: value },
        undoStack: [...undoStack, { rowId, columnId, previous: edits[key] }].slice(-200),
        ...(status === "RUNNING" ? { status: "PAUSED_BY_USER" as SessionStatus } : {}),
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
      const { originalFile, sheetName, parsed, edits, name, fileName } = get();
      if (!originalFile || !sheetName || !parsed) return;
      set({ busy: true });
      try {
        const blob = await exportWithEdits(originalFile, sheetName, parsed, edits);
        download(blob, outName(name ?? fileName ?? "envanter"));
        set({ busy: false, status: "COMPLETED" });
        persist(true);
      } catch (e) {
        set({ busy: false, error: (e as Error).message });
      }
    },
  };
});

export const columnWidth = (view: ViewPrefs, col: SheetColumn) =>
  view.columnWidths[col.id] ?? col.defaultWidth;
