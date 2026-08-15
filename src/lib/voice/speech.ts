/* Thin wrapper around the browser SpeechRecognition API (Chrome/Edge/Safari iOS 15+). */

export interface SpeechEvents {
  onFinal: (text: string) => void;
  onInterim: (text: string) => void;
  onError: (code: string) => void;
  onEnd: () => void;
  onStart?: () => void;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyRecognition = any;

const getCtor = (): AnyRecognition | null => {
  if (typeof window === "undefined") return null;
  const w = window as any;
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};

export const speechSupported = (): boolean => getCtor() !== null;

/** Requests the mic with the DSP constraints the device supports. Best effort. */
export async function primeMicrophone(): Promise<string | null> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    return "Bu cihazda mikrofon erişimi yok.";
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        noiseSuppression: true,
        echoCancellation: true,
        autoGainControl: true,
      },
    });
    stream.getTracks().forEach((t) => t.stop());
    return null;
  } catch (e) {
    const name = (e as Error).name;
    if (name === "NotAllowedError") return "Mikrofon izni reddedildi.";
    if (name === "NotFoundError") return "Mikrofon bulunamadı.";
    return "Mikrofon başlatılamadı.";
  }
}

export class SpeechCapture {
  private rec: AnyRecognition | null = null;
  private wantRunning = false;
  private events: SpeechEvents;
  private continuous = true;
  lang = "tr-TR";

  constructor(events: SpeechEvents) {
    this.events = events;
  }

  get supported() {
    return speechSupported();
  }

  start(continuous: boolean) {
    const Ctor = getCtor();
    if (!Ctor) {
      this.events.onError("unsupported");
      return;
    }
    this.continuous = continuous;
    this.wantRunning = true;
    if (this.rec) this.hardStop();
    const rec = new Ctor();
    rec.lang = this.lang;
    rec.continuous = continuous;
    rec.interimResults = true;
    rec.maxAlternatives = 3;
    rec.onstart = () => this.events.onStart?.();
    rec.onresult = (event: any) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const text = String(result[0]?.transcript ?? "").trim();
        if (!text) continue;
        if (result.isFinal) this.events.onFinal(text);
        else interim += ` ${text}`;
      }
      if (interim.trim()) this.events.onInterim(interim.trim());
    };
    rec.onerror = (e: any) => {
      const code = String(e?.error ?? "error");
      if (code === "no-speech" || code === "aborted") return;
      this.events.onError(code);
    };
    rec.onend = () => {
      if (this.wantRunning && this.continuous) {
        // Chrome stops the stream periodically; restart to keep listening.
        try {
          rec.start();
          return;
        } catch {
          /* fallthrough */
        }
      }
      this.events.onEnd();
    };
    this.rec = rec;
    try {
      rec.start();
    } catch {
      /* already started */
    }
  }

  stop() {
    this.wantRunning = false;
    try {
      this.rec?.stop();
    } catch {
      /* noop */
    }
  }

  hardStop() {
    this.wantRunning = false;
    try {
      this.rec?.abort();
    } catch {
      /* noop */
    }
    this.rec = null;
  }
}
