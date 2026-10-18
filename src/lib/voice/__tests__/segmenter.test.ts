import { describe, expect, it } from "vitest";
import { isHallucination, Segmenter } from "@/lib/voice/segmenter";
import { resample } from "@/lib/voice/whisper";

const RATE = 16000;
const chunk = (level: number, ms = 256) => new Float32Array(Math.round((RATE * ms) / 1000)).fill(level);

describe("Segmenter", () => {
  it("cuts an utterance after the silence that follows speech", () => {
    const s = new Segmenter({ sampleRate: RATE });
    const out: Float32Array[] = [];
    for (let i = 0; i < 4; i++) out.push(...s.push(chunk(0.001))); // quiet room
    for (let i = 0; i < 6; i++) out.push(...s.push(chunk(0.2))); // speech ~1.5 s
    expect(out).toHaveLength(0); // still inside the utterance
    for (let i = 0; i < 4; i++) out.push(...s.push(chunk(0.001))); // ~1 s of silence
    expect(out).toHaveLength(1);
    // pre-roll + speech + trailing silence, never the whole quiet room
    expect(out[0]!.length).toBeGreaterThan(RATE * 1.5);
    expect(out[0]!.length).toBeLessThan(RATE * 3.5);
  });

  it("drops clicks that are too short to be speech", () => {
    const s = new Segmenter({ sampleRate: RATE });
    const out: Float32Array[] = [];
    out.push(...s.push(chunk(0.3, 64)));
    for (let i = 0; i < 6; i++) out.push(...s.push(chunk(0.001)));
    expect(out).toHaveLength(0);
  });

  it("push-to-talk: flush returns the utterance in progress", () => {
    const s = new Segmenter({ sampleRate: RATE, silenceMs: 60_000 });
    for (let i = 0; i < 5; i++) s.push(chunk(0.2));
    for (let i = 0; i < 8; i++) s.push(chunk(0.001)); // a long pause between words must not cut it
    const tail = s.flush();
    expect(tail).not.toBeNull();
    expect(s.flush()).toBeNull();
  });

  it("cuts speech that never pauses at the maximum length", () => {
    const s = new Segmenter({ sampleRate: RATE, maxMs: 2000 });
    const out: Float32Array[] = [];
    for (let i = 0; i < 12; i++) out.push(...s.push(chunk(0.2)));
    expect(out.length).toBeGreaterThanOrEqual(1);
  });
});

describe("isHallucination", () => {
  it.each(["", " . ", "Altyazı M.K.", "İzlediğiniz için teşekkürler", "Thanks for watching!"])(
    "drops %j",
    (t) => expect(isHallucination(t)).toBe(true),
  );
  it.each(["chivas oniki bir şişe", "nokta iki", "jack daniels 0.7"])("keeps %j", (t) =>
    expect(isHallucination(t)).toBe(false),
  );
});

describe("resample", () => {
  it("brings 48 kHz audio down to 16 kHz", () => {
    const out = resample(new Float32Array(4800).fill(0.5), 48000, 16000);
    expect(out.length).toBe(1600);
    expect(out[10]).toBeCloseTo(0.5);
  });
});
