/// <reference lib="webworker" />
/* Runs the Whisper model off the main thread so the sheet stays responsive. */
import { env, pipeline } from "@huggingface/transformers";

export const WHISPER_MODEL = "onnx-community/whisper-small";

type In =
  | { type: "load" }
  | { type: "transcribe"; id: number; audio: Float32Array };

env.allowLocalModels = false;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let asr: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let loading: Promise<any> | null = null;

const post = (msg: unknown) => (self as unknown as Worker).postMessage(msg);

async function build(device: "webgpu" | "wasm") {
  const progress_callback = (p: { status?: string; progress?: number; file?: string }) => {
    if (p.status === "progress" && typeof p.progress === "number") {
      post({ type: "progress", progress: p.progress, file: p.file ?? "" });
    }
  };
  return pipeline("automatic-speech-recognition", WHISPER_MODEL, {
    device,
    dtype:
      device === "webgpu"
        ? { encoder_model: "fp32", decoder_model_merged: "q4" }
        : { encoder_model: "q8", decoder_model_merged: "q8" },
    progress_callback,
  } as never);
}

async function load() {
  if (asr) return asr;
  if (!loading) {
    loading = (async () => {
      const hasGpu = typeof navigator !== "undefined" && "gpu" in navigator;
      try {
        asr = await build(hasGpu ? "webgpu" : "wasm");
      } catch (e) {
        if (!hasGpu) throw e;
        asr = await build("wasm"); // GPU path failed, fall back to the CPU build
      }
      return asr;
    })().finally(() => {
      loading = null;
    });
  }
  return loading;
}

self.onmessage = async (event: MessageEvent<In>) => {
  const msg = event.data;
  try {
    if (msg.type === "load") {
      await load();
      post({ type: "ready" });
    } else if (msg.type === "transcribe") {
      const model = await load();
      const out = await model(msg.audio, { language: "turkish", task: "transcribe" });
      const text = Array.isArray(out) ? out.map((o) => o.text).join(" ") : String(out?.text ?? "");
      post({ type: "result", id: msg.id, text: text.trim() });
    }
  } catch (e) {
    post({
      type: "error",
      id: msg.type === "transcribe" ? msg.id : undefined,
      message: (e as Error).message ?? String(e),
    });
  }
};
