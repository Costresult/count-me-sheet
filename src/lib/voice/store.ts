import { create } from "zustand";
import { useCountMe } from "@/lib/countme/store";
import { parseUtterance, type ParsedUtterance } from "./parser";
import { parseCommand } from "./commands";
import { buildProductIndex, type ProductRow } from "./productIndex";
import { candidateGroups, matchProduct, type MatchConfidence } from "./matcher";
import { resolveUnitDestination } from "./unitResolver";
import {
  learnAlias,
  listAliases,
  deleteAlias,
  recordCorrection,
  type AliasRecord,
} from "./aliases";
import { primeMicrophone, SpeechCapture, speechSupported } from "./speech";
import { unitLabel } from "./units";

export type VoiceState =
  | "IDLE"
  | "LISTENING"
  | "PROCESSING"
  | "PAUSED"
  | "PAUSED_BY_USER"
  | "ERROR";

export type MicMode = "continuous" | "push";

export interface TranscriptEntry {
  id: string;
  rawTranscript: string;
  normalizedTranscript: string;
  timestamp: number;
  sessionId: string | null;
  physicalPage: number;
  outcome: "written" | "candidates" | "unmatched" | "command" | "ignored";
  detail: string;
}

export interface CandidateOption {
  rowId: string;
  label: string;
  score: number;
}

export interface CandidatePrompt {
  utterance: ParsedUtterance;
  confidence: MatchConfidence;
  options: CandidateOption[];
  aiBestRowId: string | null;
  kind: "product" | "unit";
}

interface VoiceStore {
  supported: boolean;
  mode: MicMode;
  state: VoiceState;
  interim: string;
  entries: TranscriptEntry[];
  queueLength: number;
  prompt: CandidatePrompt | null;
  error: string | null;
  aliases: AliasRecord[];
  panelOpen: boolean;

  refreshAliases: () => Promise<void>;
  forgetAlias: (id: string) => Promise<void>;
  setMode: (mode: MicMode) => void;
  setPanelOpen: (open: boolean) => void;
  startListening: () => Promise<void>;
  pauseListening: (byUser?: boolean) => void;
  resumeListening: () => void;
  stopListening: () => void;
  pushToTalkStart: () => Promise<void>;
  pushToTalkEnd: () => void;
  /** Feeds a transcript into the engine (mic or automated tests). */
  ingestTranscript: (text: string) => void;
  chooseCandidate: (index: number) => Promise<void>;
  dismissPrompt: (toUnmatched?: boolean) => void;
}

const uid = (p: string) => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

let capture: SpeechCapture | null = null;
const queue: string[] = [];
let draining = false;

export const useVoice = create<VoiceStore>((set, get) => {
  const cme = () => useCountMe.getState();

  const pushEntry = (e: Omit<TranscriptEntry, "id" | "timestamp" | "sessionId">) => {
    const entry: TranscriptEntry = {
      ...e,
      id: uid("t"),
      timestamp: Date.now(),
      sessionId: cme().activeId,
    };
    set({ entries: [entry, ...get().entries].slice(0, 40) });
  };

  const canWrite = () => {
    const st = get().state;
    return st !== "PAUSED_BY_USER" && st !== "PAUSED" && st !== "ERROR";
  };

  const groupRows = (index: ProductRow[], key: string) => index.filter((r) => r.groupKey === key);

  const optionLabel = (row: ProductRow) => row.label;

  const applyWrites = (
    writes: { rowId: string; value: number; note: string }[],
    u: ParsedUtterance,
    index: ProductRow[],
  ) => {
    const page = cme().pages.activePage;
    const names: string[] = [];
    for (const w of writes) {
      cme().writePageValue(w.rowId, page, w.value, "VOICE_AI");
      const row = index.find((r) => r.rowId === w.rowId);
      names.push(`${row?.label ?? w.rowId} = ${w.value}`);
    }
    pushEntry({
      rawTranscript: u.rawTranscript,
      normalizedTranscript: u.normalizedTranscript,
      physicalPage: page,
      outcome: "written",
      detail: names.join(" · "),
    });
  };

  const toUnmatched = (u: ParsedUtterance, detail: string) => {
    const page = cme().pages.activePage;
    const first = u.terms[0];
    cme().addUnmatchedProduct(
      u.productText || u.rawTranscript,
      first ? first.quantity : null,
      first?.unit ? unitLabel[first.unit] : "",
      page,
      u.rawTranscript,
      "VOICE_AI",
    );
    pushEntry({
      rawTranscript: u.rawTranscript,
      normalizedTranscript: u.normalizedTranscript,
      physicalPage: page,
      outcome: "unmatched",
      detail,
    });
  };

  const handleCommand = (raw: string): boolean => {
    const cmd = parseCommand(raw);
    if (!cmd) return false;
    const c = cme();
    switch (cmd.kind) {
      case "pause":
        get().pauseListening(false);
        break;
      case "stop":
        get().stopListening();
        break;
      case "resume":
        get().resumeListening();
        break;
      case "next-page":
        c.nextPage();
        break;
      case "previous-page":
        c.previousPage();
        break;
      case "goto-page":
        c.setActivePage(cmd.page);
        break;
      case "undo":
        c.undoLast();
        break;
      case "select": {
        const prompt = get().prompt;
        if (prompt && prompt.options[cmd.index - 1]) void get().chooseCandidate(cmd.index - 1);
        break;
      }
    }
    pushEntry({
      rawTranscript: raw,
      normalizedTranscript: raw,
      physicalPage: cme().pages.activePage,
      outcome: "command",
      detail: cmd.kind,
    });
    return true;
  };

  const processOne = async (raw: string) => {
    if (handleCommand(raw)) return;
    const u = parseUtterance(raw);
    const parsed = cme().parsed;
    if (!parsed) return;
    if (!u.productText) {
      pushEntry({
        rawTranscript: raw,
        normalizedTranscript: u.normalizedTranscript,
        physicalPage: cme().pages.activePage,
        outcome: "ignored",
        detail: "ürün adı anlaşılmadı",
      });
      return;
    }

    const index = buildProductIndex(parsed);
    const match = matchProduct(index, u.productText, get().aliases);

    if (!match.best || match.confidence === "LOW") {
      toUnmatched(u, `düşük eşleşme (${match.best ? match.best.row.name : "yok"})`);
      return;
    }

    if (match.confidence === "MEDIUM") {
      const groups = candidateGroups(match.candidates).slice(0, 5);
      set({
        prompt: {
          utterance: u,
          confidence: match.confidence,
          options: groups.map((g) => ({
            rowId: g.row.rowId,
            label: optionLabel(g.row),
            score: g.score,
          })),
          aiBestRowId: match.best.row.rowId,
          kind: "product",
        },
      });
      pushEntry({
        rawTranscript: raw,
        normalizedTranscript: u.normalizedTranscript,
        physicalPage: cme().pages.activePage,
        outcome: "candidates",
        detail: "ürün seçimi bekleniyor",
      });
      return;
    }

    const rows = groupRows(index, match.best.row.groupKey);
    const resolution = resolveUnitDestination(rows, u);
    if (resolution.writes.length > 0) {
      applyWrites(resolution.writes, u, index);
      return;
    }
    if (resolution.ambiguousRows && resolution.ambiguousRows.length > 0) {
      set({
        prompt: {
          utterance: u,
          confidence: match.confidence,
          options: resolution.ambiguousRows.slice(0, 5).map((r) => ({
            rowId: r.rowId,
            label: optionLabel(r),
            score: 0,
          })),
          aiBestRowId: match.best.row.rowId,
          kind: "unit",
        },
      });
      pushEntry({
        rawTranscript: raw,
        normalizedTranscript: u.normalizedTranscript,
        physicalPage: cme().pages.activePage,
        outcome: "candidates",
        detail: "birim seçimi bekleniyor",
      });
      return;
    }
    toUnmatched(u, resolution.reason);
  };

  const drain = async () => {
    if (draining) return;
    draining = true;
    try {
      while (queue.length > 0) {
        if (!canWrite() || get().prompt) break;
        const next = queue.shift()!;
        set({ queueLength: queue.length, state: "PROCESSING" });
        try {
          await processOne(next);
        } catch (e) {
          set({ error: (e as Error).message });
        }
      }
    } finally {
      draining = false;
      set({ queueLength: queue.length });
      const st = get().state;
      if (st === "PROCESSING") set({ state: capture ? "LISTENING" : "IDLE" });
    }
  };

  const ensureCapture = () => {
    if (capture) return capture;
    capture = new SpeechCapture({
      onFinal: (text) => get().ingestTranscript(text),
      onInterim: (text) => set({ interim: text }),
      onError: (code) =>
        set({
          state: "ERROR",
          error:
            code === "not-allowed"
              ? "Mikrofon izni verilmedi."
              : code === "unsupported"
                ? "Bu tarayıcı ses tanımayı desteklemiyor."
                : `Ses tanıma hatası: ${code}`,
        }),
      onEnd: () => {
        if (get().state === "LISTENING") set({ state: "IDLE" });
      },
    });
    return capture;
  };

  return {
    supported: typeof window !== "undefined" ? speechSupported() : false,
    mode: "continuous",
    state: "IDLE",
    interim: "",
    entries: [],
    queueLength: 0,
    prompt: null,
    error: null,
    aliases: [],
    panelOpen: false,

    refreshAliases: async () => set({ aliases: await listAliases() }),
    forgetAlias: async (id) => {
      await deleteAlias(id);
      set({ aliases: await listAliases() });
    },

    setMode: (mode) => {
      const wasListening = get().state === "LISTENING";
      set({ mode });
      if (wasListening) {
        capture?.stop();
        set({ state: "IDLE" });
      }
    },

    setPanelOpen: (open) => set({ panelOpen: open }),

    startListening: async () => {
      set({ error: null });
      const micError = await primeMicrophone();
      if (micError) {
        set({ state: "ERROR", error: micError });
        return;
      }
      if (!speechSupported()) {
        set({
          state: "ERROR",
          error: "Bu tarayıcı ses tanımayı desteklemiyor (Chrome veya Edge önerilir).",
        });
        return;
      }
      const c = ensureCapture();
      c.start(get().mode === "continuous");
      set({ state: "LISTENING", supported: true });
      if (useCountMe.getState().status !== "RUNNING") useCountMe.getState().setStatus("RUNNING");
      void get().refreshAliases();
    },

    pauseListening: (byUser = false) => {
      capture?.stop();
      set({ state: byUser ? "PAUSED_BY_USER" : "PAUSED", interim: "" });
    },

    resumeListening: () => {
      set({ error: null, state: "LISTENING" });
      if (useCountMe.getState().status !== "RUNNING") useCountMe.getState().setStatus("RUNNING");
      // queued speech is always flushed first, even if the microphone fails to restart
      void (async () => {
        await drain();
        if (capture) capture.start(get().mode === "continuous");
        else await get().startListening();
      })();
    },

    stopListening: () => {
      capture?.hardStop();
      capture = null;
      queue.length = 0;
      set({ state: "IDLE", interim: "", queueLength: 0 });
    },

    pushToTalkStart: async () => {
      if (get().mode !== "push") set({ mode: "push" });
      const micError = await primeMicrophone();
      if (micError) {
        set({ state: "ERROR", error: micError });
        return;
      }
      const c = ensureCapture();
      c.start(false);
      set({ state: "LISTENING", error: null });
    },

    pushToTalkEnd: () => {
      capture?.stop();
      set({ state: get().queueLength > 0 ? "PROCESSING" : "IDLE", interim: "" });
    },

    ingestTranscript: (text) => {
      const raw = text.trim();
      if (!raw) return;
      set({ interim: "" });
      queue.push(raw);
      set({ queueLength: queue.length });
      void drain();
    },

    chooseCandidate: async (index) => {
      const prompt = get().prompt;
      if (!prompt) return;
      const option = prompt.options[index];
      if (!option) return;
      set({ prompt: null });
      const parsed = cme().parsed;
      if (!parsed) return;
      const catalogue = buildProductIndex(parsed);
      const row = catalogue.find((r) => r.rowId === option.rowId);
      if (!row) return;

      cme().focusProductRow(row.rowId);

      const u = prompt.utterance;
      const rows = prompt.kind === "unit" ? [row] : groupRows(catalogue, row.groupKey);
      const resolution = resolveUnitDestination(rows, u);
      const writes =
        resolution.writes.length > 0
          ? resolution.writes
          : u.terms[0]
            ? [{ rowId: row.rowId, value: u.terms[0].quantity, note: "seçim" }]
            : [];
      if (writes.length > 0) applyWrites(writes, u, catalogue);

      await learnAlias({
        spokenAlias: u.productText,
        targetProductIdentity: row.groupKey,
        targetProductName: row.name,
        targetUnit: row.unitText || null,
        source: prompt.aiBestRowId && prompt.aiBestRowId !== row.rowId
          ? "USER_CORRECTION"
          : "USER_SELECTION",
      });
      await recordCorrection({
        sessionId: cme().activeId,
        rawTranscript: u.rawTranscript,
        aiCandidate: prompt.options[0]?.label ?? null,
        aiRowId: prompt.aiBestRowId,
        correctedRowId: row.rowId,
        correctedName: row.label,
        physicalPage: cme().pages.activePage,
        unitContext: u.normalizedUnit ?? null,
      });
      await get().refreshAliases();
      void drain();
    },

    dismissPrompt: (unmatched = true) => {
      const prompt = get().prompt;
      set({ prompt: null });
      if (prompt && unmatched) toUnmatched(prompt.utterance, "kullanıcı seçmedi");
      void drain();
    },
  };
});

/** Manual grid edits pause the voice engine immediately. */
if (typeof window !== "undefined") {
  useCountMe.subscribe((state, prev) => {
    if (state.status === "PAUSED_BY_USER" && prev.status !== "PAUSED_BY_USER") {
      const v = useVoice.getState();
      if (v.state === "LISTENING" || v.state === "PROCESSING") v.pauseListening(true);
    }
  });
}
