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

/** Turkish ordinals used only for page navigation ("onuncu sayfa"). */
const PAGE_ORDINALS: Record<string, number> = {
  ...ORDINALS,
  altincisi: 6, altinci: 6,
  yedincisi: 7, yedinci: 7,
  sekizincisi: 8, sekizinci: 8,
  dokuzuncusu: 9, dokuzuncu: 9,
  onuncusu: 10, onuncu: 10,
};

const PAGE_VERB = "(?:\\s+(?:gec|gecis|geciyorum|git|gidelim|atla|ac))?";

/** "2. sayfaya geç", "sayfa 2", "sayfa iki", "ikinci sayfaya geç" → page number */
function parsePageTarget(t: string): number | null {
  // "<n>. sayfa(ya) [geç]" / "<n> sayfa"
  let m = new RegExp(`^(\\d+)\\.?\\s*(?:nci|inci|uncu|unci)?\\s*sayfa(?:ya|da|si|ye)?${PAGE_VERB}$`).exec(t);
  if (m) return Number(m[1]);
  // "sayfa <n>" / "sayfa iki"
  m = new RegExp(`^sayfa(?:ya|yi)?\\s+(.+?)${PAGE_VERB}$`).exec(t);
  if (m) {
    const rest = m[1]!.trim();
    if (PAGE_ORDINALS[rest]) return PAGE_ORDINALS[rest]!;
    const n = parseNumberAt(rest.split(" "), 0);
    if (n && n.value >= 1) return Math.round(n.value);
    return null;
  }
  // "ikinci sayfa(ya) [geç]"
  m = new RegExp(`^([a-z]+)\\s+sayfa(?:ya|da|si|ye)?${PAGE_VERB}$`).exec(t);
  if (m && PAGE_ORDINALS[m[1]!]) return PAGE_ORDINALS[m[1]!]!;
  return null;
}

/** Detects a control command. Returns null for ordinary product speech. */
export function parseCommand(raw: string): VoiceCommand | null {
  const t = normalizeText(raw);
  if (!t) return null;
  const words = t.split(" ");

  if (/^(sonraki sayfa|next page|ileri sayfa|sayfa ileri|sonraki sayfaya gec)$/.test(t))
    return { kind: "next-page" };
  if (/^(onceki sayfa|previous page|geri sayfa|sayfa geri|onceki sayfaya gec)$/.test(t))
    return { kind: "previous-page" };

  const target = parsePageTarget(t);
  if (target !== null && target >= 1) return { kind: "goto-page", page: target };

  if (t in ORDINALS) return { kind: "select", index: ORDINALS[t]! };
  if (words.length <= 2 && ORDINALS[words[0]!]) return { kind: "select", index: ORDINALS[words[0]!]! };

  if (/^(bekle|duraklat|pause)$/.test(t)) return { kind: "pause" };
  if (/^(dur|stop|kapat)$/.test(t)) return { kind: "stop" };
  if (/^(devam|devam et|resume|basla|baslat)$/.test(t)) return { kind: "resume" };
  if (/^(geri al|undo|iptal et)$/.test(t)) return { kind: "undo" };
  return null;
}
