import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useVoice } from "@/lib/voice/store";
import { useCountMe } from "@/lib/countme/store";
import { StockSearch } from "./StockSearch";
import { GripHorizontal, ListPlus, Search, SkipForward, X } from "lucide-react";

const conf: Record<string, string> = { HIGH: "Yüksek", MEDIUM: "Orta", LOW: "Belirsiz" };

const POS_KEY = "countme-decision-popup-pos";
type Pos = { x: number; y: number };

const loadPos = (): Pos | null => {
  try {
    const raw = window.localStorage.getItem(POS_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Pos;
    return Number.isFinite(p.x) && Number.isFinite(p.y) ? p : null;
  } catch {
    return null;
  }
};

const savePos = (p: Pos | null) => {
  try {
    if (p) window.localStorage.setItem(POS_KEY, JSON.stringify(p));
    else window.localStorage.removeItem(POS_KEY);
  } catch {
    /* position is a convenience only */
  }
};

/** Keeps at least the title bar on screen. */
const clampPos = (p: Pos, width: number): Pos => ({
  x: Math.min(Math.max(0, p.x), Math.max(0, window.innerWidth - Math.min(width, window.innerWidth))),
  y: Math.min(Math.max(0, p.y), Math.max(0, window.innerHeight - 48)),
});

/**
 * Decision popup – never auto-writes, the queue waits for it. Starts at the right edge; drag the
 * title bar to put it anywhere on the page (remembered), double-click the title bar to reset.
 */
export function VoiceDecisionPopup() {
  const prompt = useVoice((s) => s.prompt);
  const choose = useVoice((s) => s.chooseCandidate);
  const chooseRow = useVoice((s) => s.chooseRow);
  const dismiss = useVoice((s) => s.dismissPrompt);
  const cancel = useVoice((s) => s.cancelPrompt);
  const skip = useVoice((s) => s.skipPrompt);
  const focusRow = useCountMe((s) => s.focusProductRow);
  const [searching, setSearching] = useState(false);
  const [pos, setPos] = useState<Pos | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ dx: number; dy: number } | null>(null);

  useEffect(() => {
    setPos(loadPos());
    const onResize = () => setPos((p) => (p ? clampPos(p, boxRef.current?.offsetWidth ?? 340) : p));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const onDragStart = (e: ReactPointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest("button")) return;
    const rect = boxRef.current?.getBoundingClientRect();
    drag.current = { dx: e.clientX - (rect?.left ?? 0), dy: e.clientY - (rect?.top ?? 0) };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onDragMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    setPos(clampPos({ x: e.clientX - drag.current.dx, y: e.clientY - drag.current.dy }, boxRef.current?.offsetWidth ?? 340));
  };
  const onDragEnd = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    drag.current = null;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    setPos((p) => {
      savePos(p);
      return p;
    });
  };

  useEffect(() => {
    setSearching(false);
  }, [prompt]);

  if (!prompt) return null;

  return (
    <div
      ref={boxRef}
      data-testid="voice-decision-popup"
      style={pos ? { left: pos.x, top: pos.y, right: "auto", transform: "none" } : undefined}
      className="pointer-events-auto fixed right-3 top-1/2 z-50 w-[min(92vw,340px)] -translate-y-1/2 rounded-lg border border-border bg-card p-3 shadow-2xl"
    >
      <div
        data-testid="voice-decision-handle"
        title="Sürükleyerek taşıyın · çift tıklayınca eski yerine döner"
        onPointerDown={onDragStart}
        onPointerMove={onDragMove}
        onPointerUp={onDragEnd}
        onPointerCancel={onDragEnd}
        onDoubleClick={() => {
          setPos(null);
          savePos(null);
        }}
        className="-mx-3 -mt-3 flex cursor-grab touch-none select-none items-start justify-between gap-2 rounded-t-lg px-3 pt-3 active:cursor-grabbing"
      >
        <p className="flex items-center gap-1 text-[11px] font-black uppercase tracking-wide text-primary">
          <GripHorizontal className="size-3.5 text-muted-foreground" />
          Eşleştirme Gerekiyor
        </p>
        <button
          type="button"
          aria-label="Kapat"
          data-testid="voice-decision-close"
          onClick={() => cancel()}
          className="-mr-1 -mt-1 rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      </div>
      <p className="mt-1 text-[12px] text-muted-foreground">
        Duyulan: <span className="font-semibold text-foreground">“{prompt.utterance.rawTranscript}”</span>
      </p>
      {prompt.productLabel && (
        <p className="mt-0.5 truncate text-[12px] text-muted-foreground">
          Bulunan ürün: <span className="font-semibold text-foreground">{prompt.productLabel}</span>
        </p>
      )}
      <p className="mt-0.5 text-[11px] text-muted-foreground">
        Ürün: %{Math.round(prompt.productScore * 100)} · Birim: {conf[prompt.unitConfidence]}
      </p>
      <p className="mt-2 text-[12px] font-semibold text-foreground">{prompt.question}</p>

      {searching ? (
        <div className="mt-2">
          <StockSearch autoFocus onSelect={(rowId) => void chooseRow(rowId)} testid="popup-stock-search" />
        </div>
      ) : (
        <div className="mt-2 flex flex-col gap-1.5">
          {prompt.options.map((o, i) => (
            <button
              key={o.rowId}
              type="button"
              data-testid={`voice-candidate-${i}`}
              onPointerEnter={() => focusRow(o.rowId)}
              onClick={() => void choose(i)}
              className="flex items-center gap-2 rounded-md bg-primary/10 px-2 py-2 text-left hover:bg-primary/20"
            >
              <span className="shrink-0 rounded bg-primary px-1.5 text-[11px] font-bold text-primary-foreground">
                {i + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-semibold text-primary">{o.label}</span>
                <span className="block truncate text-[11px] text-muted-foreground">
                  yazılacak: {o.value}
                  {o.note ? ` · ${o.note}` : ""}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}

      <div className="mt-2 flex gap-1.5">
        <button
          type="button"
          data-testid="voice-pick-other"
          onClick={() => setSearching((v) => !v)}
          className="inline-flex flex-1 items-center justify-center gap-1 rounded-md bg-secondary px-2 py-1.5 text-[12px] font-medium text-secondary-foreground hover:bg-accent"
        >
          <Search className="size-3.5" />
          {searching ? "Seçeneklere Dön" : "Başka Ürün Seç"}
        </button>
        <button
          type="button"
          data-testid="voice-candidates-dismiss"
          onClick={() => dismiss(true)}
          className="inline-flex flex-1 items-center justify-center gap-1 rounded-md bg-secondary px-2 py-1.5 text-[12px] font-medium text-secondary-foreground hover:bg-accent"
        >
          <ListPlus className="size-3.5" />
          Eşleşmeyenlere Ekle
        </button>
      </div>
      <button
        type="button"
        data-testid="voice-skip"
        onClick={() => skip()}
        className="mt-1.5 inline-flex w-full items-center justify-center gap-1 rounded-md bg-secondary px-2 py-1.5 text-[12px] font-semibold text-secondary-foreground hover:bg-accent"
      >
        <SkipForward className="size-3.5" />
        ATLA
      </button>
    </div>
  );
}
