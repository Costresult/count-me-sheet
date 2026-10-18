/* Cuts a continuous microphone stream into utterances (pure logic, no browser APIs). */

export interface SegmenterOptions {
  sampleRate: number;
  /** RMS level above which a chunk counts as speech */
  threshold?: number;
  /** silence that ends an utterance */
  silenceMs?: number;
  /** audio kept before the first loud chunk so word beginnings are not cut */
  preRollMs?: number;
  /** utterances shorter than this are dropped (clicks, breaths) */
  minSpeechMs?: number;
  /** hard cap; longer speech is cut here */
  maxMs?: number;
}

export const rms = (samples: Float32Array): number => {
  if (samples.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i]! * samples[i]!;
  return Math.sqrt(sum / samples.length);
};

const join = (parts: Float32Array[]): Float32Array => {
  const out = new Float32Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
};

export class Segmenter {
  private readonly o: Required<SegmenterOptions>;
  private preRoll: Float32Array[] = [];
  private preRollSamples = 0;
  private current: Float32Array[] = [];
  private currentSamples = 0;
  private speechSamples = 0;
  private silentSamples = 0;
  private inSpeech = false;

  constructor(options: SegmenterOptions) {
    this.o = {
      threshold: 0.015,
      silenceMs: 900,
      preRollMs: 300,
      minSpeechMs: 250,
      maxMs: 20000,
      ...options,
    };
  }

  private ms(samples: number) {
    return (samples / this.o.sampleRate) * 1000;
  }

  /** Feeds one audio chunk; returns the finished utterances (usually zero or one). */
  push(chunk: Float32Array): Float32Array[] {
    const out: Float32Array[] = [];
    const loud = rms(chunk) >= this.o.threshold;

    if (!this.inSpeech) {
      if (!loud) {
        this.preRoll.push(chunk);
        this.preRollSamples += chunk.length;
        while (this.preRoll.length > 1 && this.ms(this.preRollSamples) > this.o.preRollMs) {
          this.preRollSamples -= this.preRoll.shift()!.length;
        }
        return out;
      }
      this.inSpeech = true;
      this.current = [...this.preRoll];
      this.currentSamples = this.preRollSamples;
      this.preRoll = [];
      this.preRollSamples = 0;
      this.speechSamples = 0;
      this.silentSamples = 0;
    }

    this.current.push(chunk);
    this.currentSamples += chunk.length;
    if (loud) {
      this.speechSamples += chunk.length;
      this.silentSamples = 0;
    } else {
      this.silentSamples += chunk.length;
    }

    if (this.ms(this.silentSamples) >= this.o.silenceMs || this.ms(this.currentSamples) >= this.o.maxMs) {
      const done = this.finish();
      if (done) out.push(done);
    }
    return out;
  }

  /** Ends the utterance in progress (push-to-talk release, mic closed). */
  flush(): Float32Array | null {
    return this.inSpeech ? this.finish() : null;
  }

  reset() {
    this.preRoll = [];
    this.preRollSamples = 0;
    this.current = [];
    this.currentSamples = 0;
    this.inSpeech = false;
  }

  private finish(): Float32Array | null {
    const audio = join(this.current);
    const longEnough = this.ms(this.speechSamples) >= this.o.minSpeechMs;
    this.reset();
    return longEnough ? audio : null;
  }
}

/** Whisper invents captions for silence or noise; these never are real counting speech. */
const HALLUCINATIONS = [
  "altyazı",
  "izlediğiniz için teşekkür",
  "abone ol",
  "iyi seyirler",
  "amara.org",
  "thanks for watching",
  "subtitles by",
];

export const isHallucination = (text: string): boolean => {
  const t = text.toLocaleLowerCase("tr-TR").trim();
  if (t.length === 0) return true;
  if (/^[\s.,!?…-]+$/.test(t)) return true;
  return HALLUCINATIONS.some((h) => t.includes(h));
};
