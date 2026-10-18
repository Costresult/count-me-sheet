/* "Gelişmiş" engine: records the microphone and transcribes it with Whisper in the browser. */
import { isHallucination, Segmenter } from "./segmenter";
import type { SpeechEvents } from "./speech";

export type EngineStatus = "idle" | "loading" | "ready" | "error";

export interface WhisperEvents extends SpeechEvents {
  onStatus?: (status: EngineStatus, detail?: { progress?: number; message?: string }) => void;
}

const RATE = 16000;

export const whisperSupported = (): boolean =>
  typeof window !== "undefined" &&
  typeof Worker !== "undefined" &&
  typeof WebAssembly !== "undefined" &&
  !!navigator.mediaDevices?.getUserMedia;

/** One shared worker: the model is large, every capture instance reuses it. */
let worker: Worker | null = null;
let status: EngineStatus = "idle";
const statusListeners = new Set<WhisperEvents["onStatus"]>();
const pending = new Map<number, (r: { text?: string; error?: string }) => void>();
let nextId = 1;

const setStatus = (s: EngineStatus, detail?: { progress?: number; message?: string }) => {
  status = s;
  statusListeners.forEach((l) => l?.(s, detail));
};

function getWorker(): Worker {
  if (worker) return worker;
  const w = new Worker(new URL("./whisperWorker.ts", import.meta.url), { type: "module" });
  w.onmessage = (e: MessageEvent) => {
    const m = e.data as {
      type: string;
      id?: number;
      text?: string;
      progress?: number;
      message?: string;
    };
    if (m.type === "progress") setStatus("loading", { progress: m.progress ?? 0 });
    else if (m.type === "ready") setStatus("ready");
    else if (m.type === "result" && m.id !== undefined) {
      pending.get(m.id)?.({ text: m.text ?? "" });
      pending.delete(m.id);
    } else if (m.type === "error") {
      if (m.id !== undefined) {
        pending.get(m.id)?.({ error: m.message ?? "error" });
        pending.delete(m.id);
      } else setStatus("error", { message: m.message ?? "error" });
    }
  };
  w.onerror = (e) => {
    setStatus("error", { message: e.message });
    pending.forEach((cb) => cb({ error: e.message }));
    pending.clear();
  };
  worker = w;
  return w;
}

/** Starts downloading/initialising the model (cached by the browser after the first time). */
export function preloadWhisper(onStatus?: WhisperEvents["onStatus"]) {
  if (onStatus) statusListeners.add(onStatus);
  if (status === "ready") {
    onStatus?.("ready");
    return;
  }
  if (status !== "loading") setStatus("loading", { progress: 0 });
  getWorker().postMessage({ type: "load" });
}

export const unsubscribeStatus = (cb: WhisperEvents["onStatus"]) => {
  statusListeners.delete(cb);
};

function transcribe(audio: Float32Array): Promise<{ text?: string; error?: string }> {
  return new Promise((resolve) => {
    const id = nextId++;
    pending.set(id, resolve);
    getWorker().postMessage({ type: "transcribe", id, audio }, [audio.buffer]);
  });
}

export class WhisperCapture {
  private events: WhisperEvents;
  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private node: ScriptProcessorNode | null = null;
  private seg: Segmenter | null = null;
  private continuous = true;
  private running = false;
  /** set on start() and cleared on stop(), so a release during the async mic start still wins */
  private wanted = false;
  /** utterances still being transcribed; the engine is "done" when this reaches zero after stop */
  private inflight = 0;
  lang = "tr-TR";

  constructor(events: WhisperEvents) {
    this.events = events;
  }

  get supported() {
    return whisperSupported();
  }

  async start(continuous: boolean) {
    this.continuous = continuous;
    this.wanted = true;
    if (this.running) return;
    if (!whisperSupported()) {
      this.events.onError("unsupported");
      return;
    }
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { noiseSuppression: true, echoCancellation: true, autoGainControl: true },
      });
      const Ctx = window.AudioContext ?? (window as never as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!this.wanted) {
        this.release();
        return;
      }
      this.ctx = new Ctx({ sampleRate: RATE });
      const source = this.ctx.createMediaStreamSource(this.stream);
      this.node = this.ctx.createScriptProcessor(4096, 1, 1);
      const sampleRate = this.ctx.sampleRate;
      this.seg = new Segmenter({ sampleRate, silenceMs: continuous ? 900 : 60_000 });
      this.node.onaudioprocess = (e) => {
        if (!this.running || !this.seg) return;
        const chunk = new Float32Array(e.inputBuffer.getChannelData(0));
        // push-to-talk keeps one utterance until release; continuous mode cuts on silence
        for (const audio of this.seg.push(chunk)) void this.recognize(audio, sampleRate);
      };
      source.connect(this.node);
      this.node.connect(this.ctx.destination); // required for onaudioprocess in some browsers
      this.running = true;
      preloadWhisper();
      this.events.onStart?.();
    } catch (e) {
      this.release();
      this.events.onError((e as Error).name === "NotAllowedError" ? "not-allowed" : "mic-error");
    }
  }

  private async recognize(audio: Float32Array, sampleRate: number) {
    this.inflight++;
    try {
      this.events.onInterim("…");
      const input = sampleRate === RATE ? audio : resample(audio, sampleRate, RATE);
      const r = await transcribe(input);
      if (r.error) {
        this.events.onError(`whisper: ${r.error}`);
      } else if (r.text && !isHallucination(r.text)) {
        this.events.onFinal(r.text);
      }
    } finally {
      this.inflight--;
      if (!this.running && this.inflight === 0) this.events.onEnd();
    }
  }

  /** Push-to-talk release or mic closed: the utterance in progress is transcribed, then ends. */
  stop() {
    this.wanted = false;
    if (!this.running) {
      this.release();
      return;
    }
    const rate = this.ctx?.sampleRate ?? RATE;
    const tail = this.seg?.flush() ?? null;
    this.running = false;
    this.release();
    if (tail) void this.recognize(tail, rate);
    else if (this.inflight === 0) this.events.onEnd();
  }

  hardStop() {
    this.wanted = false;
    this.running = false;
    this.seg?.reset();
    this.release();
  }

  private release() {
    try {
      this.node && (this.node.onaudioprocess = null);
      this.node?.disconnect();
      this.stream?.getTracks().forEach((t) => t.stop());
      void this.ctx?.close();
    } catch {
      /* noop */
    }
    this.node = null;
    this.stream = null;
    this.ctx = null;
  }
}

/** Linear resampling, only used when the browser ignored the requested 16 kHz context. */
export function resample(input: Float32Array, from: number, to: number): Float32Array {
  if (from === to) return input;
  const ratio = from / to;
  const out = new Float32Array(Math.floor(input.length / ratio));
  for (let i = 0; i < out.length; i++) {
    const pos = i * ratio;
    const i0 = Math.floor(pos);
    const i1 = Math.min(i0 + 1, input.length - 1);
    const frac = pos - i0;
    out[i] = input[i0]! * (1 - frac) + input[i1]! * frac;
  }
  return out;
}
