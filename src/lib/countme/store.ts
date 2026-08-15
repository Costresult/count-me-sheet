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
import { exportWithEdits, loadWorkbook, parseSheet, withAddedColumns } from "./workbook";
import { derivePages, MAX_PAGES, pageColumnId } from "./pages";
import {
  type AddedColumn,
  editKey,
  emptyPages,
  type ChangeAction,
  type ChangeSource,
  type HistoryEvent,
  type PageState,
  type ParsedSheet,
  type SessionMeta,
  type SessionStatus,
  type SheetColumn,
  type StoredSession,
  type UnmatchedProduct,
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

type UndoEntry =
  | { type: "cell"; rowId: string; columnId: string; previous: number | null | undefined }
  | { type: "unmatched-add"; id: string }
  | { type: "unmatched-remove"; item: UnmatchedProduct }
  | { type: "unmatched-update"; item: UnmatchedProduct }
  | {
      type: "unmatched-resolve";
      item: UnmatchedProduct;
      rowId: string;
      columnId: string;
      previous: number | null | undefined;
    };

export type WriteSource = "USER" | "SYSTEM";

export interface WriteConflict {
  rowId: string;
  page: number;
  columnId: string;
  existing: number | string;
  value: number | null;
  source: WriteSource;
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
  pages: PageState;
  pageFeedback: string | null;
  conflict: WriteConflict | null;
  mappingOpen: boolean;
  addedColumns: AddedColumn[];
  unmatched: UnmatchedProduct[];
  history: HistoryEvent[];
  unmatchedOpen: boolean;
  completeOpen: boolean;

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

  // unmatched products
  setUnmatchedOpen: (open: boolean) => void;
  setCompleteOpen: (open: boolean) => void;
  addUnmatchedProduct: (
    name: string,
    amount: number | null,
    unit: string,
    physicalPage: number,
    rawInput: string,
    source?: ChangeSource,
  ) => string | null;
  updateUnmatchedProduct: (
    id: string,
    patch: Partial<Pick<UnmatchedProduct, "name" | "amount" | "unit" | "physicalPage">>,
  ) => void;
  removeUnmatchedProduct: (id: string) => void;
  resolveUnmatchedToRow: (id: string, rowId: string) => void;

  // physical page engine
  setActivePage: (page: number) => void;
  nextPage: () => void;
  previousPage: () => void;
  getActivePage: () => number;
  setPageCount: (count: number) => void;
  setPageColumn: (page: number, columnId: string | null) => void;
  setMappingOpen: (open: boolean) => void;
  addCountColumn: (page?: number) => string | null;
  writePageValue: (
    rowId: string,
    page: number,
    value: number | null,
    source?: WriteSource,
  ) => void;
  resolveConflict: (accept: boolean) => void;

  focusProductRow: (rowId: string) => void;
  focusCell: (rowId: string, columnId: string) => void;
  clearFocus: (token: number) => void;

  setColumnWidth: (columnId: string, width: number) => void;
  setColumnWidths: (widths: Record<string, number>) => void;
  setRowHeight: (height: number) => void;
  resetView: () => void;

  exportFile: () => Promise<void>;
  exportDraft: () => Promise<void>;
  completeInventory: () => Promise<void>;
}

const emptyView = (): ViewPrefs => ({ columnWidths: {}, rowHeight: DEFAULT_ROW_HEIGHT });

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let focusToken = 0;
let feedbackTimer: ReturnType<typeof setTimeout> | null = null;

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
      pages: s.pages,
      addedColumns: s.addedColumns,
      unmatched: s.unmatched,
      history: s.history,
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
    const addedColumns = session.addedColumns ?? [];
    const base = sheetName ? parseSheet(wb.getWorksheet(sheetName)) : null;
    const parsed = withAddedColumns(base, addedColumns);
    set({
      activeId: session.id,
      name: session.name,
      fileName: session.fileName,
      createdAt: session.createdAt,
      originalFile: session.originalFile,
      sheetNames: names,
      sheetName,
      parsed,
      addedColumns,
      unmatched: session.unmatched ?? [],
      history: session.history ?? [],
      unmatchedOpen: false,
      completeOpen: false,
      edits: session.edits ?? {},
      view: session.view ?? emptyView(),
      pages: derivePages(parsed, session.pages),
      conflict: null,
      pageFeedback: null,
      mappingOpen: false,
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
      pages: emptyPages(),
      conflict: null,
      pageFeedback: null,
      mappingOpen: false,
      addedColumns: [],
      unmatched: [],
      history: [],
    });

  const pageOfColumn = (columnId: string): number | null => {
    const { pages } = get();
    for (let p = 1; p <= pages.pageCount; p++) if (pages.pageColumns[p] === columnId) return p;
    return null;
  };

  const logHistory = (e: {
    action: ChangeAction;
    rowId?: string | null;
    columnId?: string | null;
    physicalPage?: number | null;
    oldValue?: string | number | null;
    newValue?: string | number | null;
    source?: ChangeSource;
    note?: string;
  }) => {
    const { history, activeId } = get();
    if (!activeId) return;
    const event: HistoryEvent = {
      id: `h${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      sessionId: activeId,
      timestamp: Date.now(),
      source: e.source ?? "MANUAL",
      action: e.action,
      rowId: e.rowId ?? null,
      columnId: e.columnId ?? null,
      physicalPage: e.physicalPage ?? null,
      oldValue: e.oldValue ?? null,
      newValue: e.newValue ?? null,
      ...(e.note ? { note: e.note } : {}),
    };
    set({ history: [...history, event].slice(-1000) });
  };

  /** Builds the xlsx from the working copy. `complete` marks the session COMPLETED. */
  const runExport = async (complete: boolean) => {
    const { originalFile, sheetName, parsed, edits, name, fileName, addedColumns, unmatched, pages } =
      get();
    if (!originalFile || !sheetName || !parsed) return;
    set({ busy: true, error: null });
    try {
      const rows = unmatched.map((u) => ({
        name: u.name,
        unit: u.unit,
        amount: u.amount,
        columnId: pageColumnId(pages, u.physicalPage),
      }));
      const out = await exportWithEdits(
        originalFile,
        sheetName,
        parsed,
        edits,
        addedColumns,
        rows,
      );
      const base = (name ?? fileName ?? "envanter").replace(/\.xls[xm]$/i, "");
      download(out.blob, complete ? `${base} - Count Me Completed.xlsx` : outName(base));
      set({
        busy: false,
        error: out.warning,
        ...(complete ? { status: "COMPLETED" as SessionStatus } : {}),
      });
      persist(true);
    } catch (e) {
      set({ busy: false, error: (e as Error).message });
    }
  };

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
    uploadPhase: "idle",
    focus: null,
    undoStack: [],
    savedAt: null,
    sidebarOpen: false,
    pages: emptyPages(),
    pageFeedback: null,
    conflict: null,
    mappingOpen: false,
    addedColumns: [],
    unmatched: [],
    history: [],
    unmatchedOpen: false,
    completeOpen: false,

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
      set({ busy: true, error: null, uploadPhase: "validating" });
      try {
        if (!file) throw new Error("Dosya okunamadı.");
        if (!/\.(xlsx|xlsm)$/i.test(file.name)) {
          throw new Error("Desteklenmeyen dosya türü. Lütfen .xlsx veya .xlsm dosyası seçin.");
        }
        if (file.size === 0) throw new Error("Dosya okunamadı. Dosya boş görünüyor.");
        if (file.size > MAX_UPLOAD_BYTES) throw new Error("Dosya çok büyük (en fazla 40 MB).");
        await flush(); // auto-save the session we are leaving
        set({ uploadPhase: "reading" });
        let buffer: ArrayBuffer;
        try {
          buffer = await file.arrayBuffer();
        } catch {
          throw new Error("Dosya okunamadı.");
        }
        set({ uploadPhase: "parsing" });
        let wb: Awaited<ReturnType<typeof loadWorkbook>>;
        try {
          wb = await loadWorkbook(buffer);
        } catch {
          throw new Error("Dosya okunamadı. Geçerli bir Excel dosyası değil.");
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const names: string[] = wb.worksheets.map((ws: any) => ws.name as string);
        if (names.length === 0) throw new Error("Excel içinde çalışma sayfası bulunamadı.");
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
        set({ sidebarOpen: false, uploadPhase: "success" });
        setTimeout(() => {
          if (get().uploadPhase === "success") set({ uploadPhase: "idle" });
        }, 1500);
        await get().refreshSessions();
      } catch (e) {
        set({ busy: false, error: (e as Error).message, uploadPhase: "error" });
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

    // Closes the active workbook and returns to the inventory library.
    // Nothing is deleted and no session is completed. When authentication is
    // added later, hook the real sign-out here after the autosave.
    exitApplication: async () => {
      await flush();
      await setActiveId(null);
      clearActive();
      set({ sidebarOpen: false, error: null, uploadPhase: "idle" });
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
          session.addedColumns ?? [],
        );
        download(blob.blob, outName(session.name || session.fileName));
        set({ busy: false, error: blob.warning });
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
        const parsed = parseSheet(ws);
        set({
          sheetName: name,
          parsed,
          busy: false,
          view: emptyView(),
          pages: derivePages(parsed),
          conflict: null,
          addedColumns: [],
        });
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
      const previous = edits[key];
      const original = parsed?.rows.find((r) => r.id === rowId)?.cells[columnId]?.value ?? null;
      const oldValue = previous === undefined ? (original as number | string | null) : previous;
      set({
        edits: { ...edits, [key]: value },
        undoStack: [...undoStack, { type: "cell" as const, rowId, columnId, previous }].slice(-200),
        ...(status === "RUNNING" ? { status: "PAUSED_BY_USER" as SessionStatus } : {}),
      });
      logHistory({
        action: value === null ? "CELL_CLEAR" : "CELL_WRITE",
        rowId,
        columnId,
        physicalPage: pageOfColumn(columnId),
        oldValue,
        newValue: value,
      });
      get().focusCell(rowId, columnId);
      persist();
    },

    clearInventoryValue: (rowId, columnId) => {
      get().writeInventoryValue(rowId, columnId, null);
    },

    // ---------- physical page engine ----------

    getActivePage: () => get().pages.activePage,

    setMappingOpen: (open) => set({ mappingOpen: open }),

    setActivePage: (page) => {
      const { pages } = get();
      const next = Math.min(Math.max(1, Math.round(page)), MAX_PAGES);
      if (next === pages.activePage) return;
      // pages are dynamic: moving forward grows the page count when needed
      const pageCount = Math.max(pages.pageCount, next);
      const pageColumns = { ...pages.pageColumns };
      for (let p = 1; p <= pageCount; p++) if (!(p in pageColumns)) pageColumns[p] = null;
      set({
        pages: { ...pages, activePage: next, pageCount, pageColumns },
        pageFeedback: pageColumns[next] ? `Sayfa ${next} aktif` : null,
      });
      if (feedbackTimer) clearTimeout(feedbackTimer);
      feedbackTimer = setTimeout(() => set({ pageFeedback: null }), 1600);
      persist();
    },

    nextPage: () => get().setActivePage(get().pages.activePage + 1),
    previousPage: () => get().setActivePage(get().pages.activePage - 1),

    setPageCount: (count) => {
      const { pages, parsed } = get();
      const target = Math.min(MAX_PAGES, Math.max(1, Math.round(count)));
      const next = derivePages(parsed, { ...pages, pageCount: target });
      set({ pages: next });
      persist();
    },

    setPageColumn: (page, columnId) => {
      const { pages, parsed } = get();
      const col = columnId ? parsed?.columns.find((c) => c.id === columnId) : null;
      if (columnId && (!col || col.kind === "total")) return;
      const pageColumns = { ...pages.pageColumns };
      // a column can only belong to one physical page
      if (columnId) {
        for (const key of Object.keys(pageColumns)) {
          const p = Number(key);
          if (p !== page && pageColumns[p] === columnId) pageColumns[p] = null;
        }
      }
      pageColumns[page] = columnId;
      set({ pages: { ...pages, pageColumns } });
      persist();
    },

    addCountColumn: (page) => {
      const { parsed, addedColumns, pages } = get();
      if (!parsed) return null;
      const existingNums = parsed.columns
        .filter((c) => c.kind === "count")
        .map((c) => {
          const m = /(\d+)\s*$/.exec(c.header);
          return m ? Number(m[1]) : 0;
        });
      const nextNum = Math.max(0, ...existingNums, parsed.columns.filter((c) => c.kind === "count").length) + 1;
      const added: AddedColumn = { id: `v${Date.now().toString(36)}`, header: `Sayım ${nextNum}` };
      const nextAdded = [...addedColumns, added];
      const nextParsed = withAddedColumns(parsed, [added]);
      set({ addedColumns: nextAdded, parsed: nextParsed });
      const target = page ?? pages.activePage;
      get().setPageColumn(target, added.id);
      set({ pageFeedback: `${added.header} kolonu oluşturuldu` });
      if (feedbackTimer) clearTimeout(feedbackTimer);
      feedbackTimer = setTimeout(() => set({ pageFeedback: null }), 2000);
      persist();
      return added.id;
    },

    writePageValue: (rowId, page, value, source = "USER") => {
      const { pages, parsed, edits } = get();
      const columnId = pageColumnId(pages, page);
      if (!columnId) {
        set({ error: `Sayfa ${page} için sayım kolonu eşlenmemiş. Lütfen mapping yapın.`, mappingOpen: true });
        return;
      }
      const row = parsed?.rows.find((r) => r.id === rowId);
      const col = parsed?.columns.find((c) => c.id === columnId);
      if (!row || !col || col.kind === "total") return;
      const key = editKey(rowId, columnId);
      const edited = edits[key];
      const current = edited === undefined ? row.cells[columnId]?.value ?? null : edited;
      const occupied = current !== null && current !== undefined && String(current).trim() !== "";
      if (source === "SYSTEM" && occupied && current !== value) {
        set({
          conflict: {
            rowId,
            page,
            columnId,
            existing: current as number | string,
            value,
            source,
          },
        });
        get().focusCell(rowId, columnId);
        return;
      }
      set({ pages: { ...pages, lastActiveRow: rowId } });
      get().writeInventoryValue(rowId, columnId, value);
    },

    resolveConflict: (accept) => {
      const c = get().conflict;
      set({ conflict: null });
      if (!c || !accept) return;
      const { pages } = get();
      set({ pages: { ...pages, lastActiveRow: c.rowId } });
      get().writeInventoryValue(c.rowId, c.columnId, c.value);
    },

    undoLast: () => {
      const { undoStack, edits, unmatched } = get();
      const last = undoStack[undoStack.length - 1];
      if (!last) return;
      const rest = undoStack.slice(0, -1);

      const restoreCell = (rowId: string, columnId: string, previous: number | null | undefined) => {
        const next = { ...get().edits };
        const key = editKey(rowId, columnId);
        if (previous === undefined) delete next[key];
        else next[key] = previous;
        set({ edits: next });
      };

      if (last.type === "cell") {
        restoreCell(last.rowId, last.columnId, last.previous);
        set({ undoStack: rest });
        logHistory({
          action: "UNDO",
          rowId: last.rowId,
          columnId: last.columnId,
          physicalPage: pageOfColumn(last.columnId),
          newValue: last.previous ?? null,
          note: "cell undo",
        });
        get().focusCell(last.rowId, last.columnId);
      } else if (last.type === "unmatched-add") {
        set({ unmatched: unmatched.filter((u) => u.id !== last.id), undoStack: rest });
        logHistory({ action: "UNDO", note: "unmatched add undo" });
      } else if (last.type === "unmatched-remove" || last.type === "unmatched-update") {
        set({
          unmatched: [...unmatched.filter((u) => u.id !== last.item.id), last.item].sort(
            (a, b) => a.timestamp - b.timestamp,
          ),
          undoStack: rest,
        });
        logHistory({ action: "UNDO", note: "unmatched restore" });
      } else {
        // unmatched -> existing product move
        restoreCell(last.rowId, last.columnId, last.previous);
        set({
          unmatched: [...unmatched.filter((u) => u.id !== last.item.id), last.item].sort(
            (a, b) => a.timestamp - b.timestamp,
          ),
          undoStack: rest,
        });
        logHistory({
          action: "UNDO",
          rowId: last.rowId,
          columnId: last.columnId,
          note: "unmatched resolve undo",
        });
      }
      // edits key removal handled above
      void edits;
      persist();
    },

    // ---------- unmatched products ----------

    setUnmatchedOpen: (open) => set({ unmatchedOpen: open }),
    setCompleteOpen: (open) => set({ completeOpen: open }),

    addUnmatchedProduct: (name, amount, unit, physicalPage, rawInput, source = "MANUAL") => {
      const { unmatched, undoStack, activeId } = get();
      const clean = name.trim();
      if (!activeId || !clean) return null;
      const item: UnmatchedProduct = {
        id: `u${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`,
        sessionId: activeId,
        name: clean,
        amount,
        unit: unit.trim(),
        physicalPage,
        rawInput,
        timestamp: Date.now(),
        resolvedRowId: null,
      };
      set({
        unmatched: [...unmatched, item],
        undoStack: [...undoStack, { type: "unmatched-add" as const, id: item.id }].slice(-200),
      });
      logHistory({
        action: "UNMATCHED_ADD",
        physicalPage,
        newValue: `${item.name} ${amount ?? ""} ${item.unit}`.trim(),
        source,
        note: rawInput,
      });
      persist();
      return item.id;
    },

    updateUnmatchedProduct: (id, patch) => {
      const { unmatched, undoStack } = get();
      const item = unmatched.find((u) => u.id === id);
      if (!item) return;
      const next = { ...item, ...patch };
      set({
        unmatched: unmatched.map((u) => (u.id === id ? next : u)),
        undoStack: [...undoStack, { type: "unmatched-update" as const, item }].slice(-200),
      });
      logHistory({
        action: "UNMATCHED_UPDATE",
        physicalPage: next.physicalPage,
        oldValue: `${item.name} ${item.amount ?? ""} ${item.unit}`.trim(),
        newValue: `${next.name} ${next.amount ?? ""} ${next.unit}`.trim(),
      });
      persist();
    },

    removeUnmatchedProduct: (id) => {
      const { unmatched, undoStack } = get();
      const item = unmatched.find((u) => u.id === id);
      if (!item) return;
      set({
        unmatched: unmatched.filter((u) => u.id !== id),
        undoStack: [...undoStack, { type: "unmatched-remove" as const, item }].slice(-200),
      });
      logHistory({
        action: "UNMATCHED_DELETE",
        physicalPage: item.physicalPage,
        oldValue: item.name,
      });
      persist();
    },

    resolveUnmatchedToRow: (id, rowId) => {
      const { unmatched, undoStack, edits, parsed, pages } = get();
      const item = unmatched.find((u) => u.id === id);
      if (!item || !parsed) return;
      const columnId = pageColumnId(pages, item.physicalPage);
      if (!columnId) {
        set({
          error: `Sayfa ${item.physicalPage} için sayım kolonu yok. Önce kolon eşleyin.`,
          mappingOpen: true,
        });
        return;
      }
      const key = editKey(rowId, columnId);
      const previous = edits[key];
      set({
        unmatched: unmatched.filter((u) => u.id !== id),
        undoStack: [
          ...undoStack,
          { type: "unmatched-resolve" as const, item, rowId, columnId, previous },
        ].slice(-200),
        edits: { ...edits, [key]: item.amount },
      });
      logHistory({
        action: "UNMATCHED_RESOLVE",
        rowId,
        columnId,
        physicalPage: item.physicalPage,
        oldValue: `${item.name} (eşleşmeyen)`,
        newValue: item.amount,
        note: `USER corrected: "${item.rawInput || item.name}" -> ${rowId}`,
      });
      get().focusCell(rowId, columnId);
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

    exportDraft: async () => {
      await runExport(false);
    },

    completeInventory: async () => {
      set({ completeOpen: false });
      await runExport(true);
    },

    exportFile: async () => {
      await runExport(true);
    },
  };
});

export const columnWidth = (view: ViewPrefs, col: SheetColumn) =>
  view.columnWidths[col.id] ?? col.defaultWidth;
