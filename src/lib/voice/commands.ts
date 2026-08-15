import { normalizeText } from "./text";
import { parseNumberAt } from "./numbers";

export type VoiceCommand =
  | { kind: "pause" }
  | { kind: "stop" }
  | { kind: "resume" }
  | { kind: "next-page" }
  | { kind: "previous-page" }
  | { kind: "goto-page"; page: number }
  | { kind: "undo" }
  | { kind: "select"; index: number };

const ORDINALS: Record<string, number> = {
  birincisi: 1, birinci: 1, ilki: 1, ilk: 1,
  ikincisi: 2, ikinci: 2,
  ucuncusu: 3, ucuncu: 3,
  dorduncusu: 4, dorduncu: 4,
  besincisi: 5, besinci: 5,
};

/** Detects a control command. Returns null for ordinary product speech. */
export function parseCommand(raw: string): VoiceCommand | null {
  const t = normalizeText(raw);
  if (!t) return null;
  const words = t.split(" ");

  if (t in ORDINALS) return { kind: "select", index: ORDINALS[t]! };
  if (words.length <= 2 && ORDINALS[words[0]!]) return { kind: "select", index: ORDINALS[words[0]!]! };

  if (/^(bekle|duraklat|pause)$/.test(t)) return { kind: "pause" };
  if (/^(dur|stop|kapat)$/.test(t)) return { kind: "stop" };
  if (/^(devam|devam et|resume|basla|baslat)$/.test(t)) return { kind: "resume" };
  if (/^(sonraki sayfa|next page|ileri sayfa|sayfa ileri)$/.test(t)) return { kind: "next-page" };
  if (/^(onceki sayfa|previous page|geri sayfa|sayfa geri)$/.test(t)) return { kind: "previous-page" };
  if (/^(geri al|undo|iptal et)$/.test(t)) return { kind: "undo" };

  const page = /^sayfa\s+(.+)$/.exec(t);
  if (page) {
    const n = parseNumberAt(page[1]!.split(" "), 0);
    if (n && n.value >= 1) return { kind: "goto-page", page: Math.round(n.value) };
  }
  return null;
}
