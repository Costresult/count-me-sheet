import { useEffect, useState } from "react";
import { useVoice } from "@/lib/voice/store";
import { useCountMe } from "@/lib/countme/store";
import { StockSearch } from "./StockSearch";
import { ListPlus, Search } from "lucide-react";

const conf: Record<string, string> = { HIGH: "Yüksek", MEDIUM: "Orta", LOW: "Belirsiz" };

/** Right-center decision popup – never auto-writes, the queue waits for it. */
export function VoiceDecisionPopup() {
  const prompt = useVoice((s) => s.prompt);
  const choose = useVoice((s) => s.chooseCandidate);
  const chooseRow = useVoice((s) => s.chooseRow);
  const dismiss = useVoice((s) => s.dismissPrompt);
  const focusRow = useCountMe((s) => s.focusProductRow);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    setSearching(false);
  }, [prompt]);

  if (!prompt) return null;

  return (
    <div
      data-testid="voice-decision-popup"
      className="pointer-events-auto fixed right-3 top-1/2 z-50 w-[min(92vw,340px)] -translate-y-1/2 rounded-lg border border-border bg-card p-3 shadow-2xl"
    >
      <p className="text-[11px] font-black uppercase tracking-wide text-primary">
        Eşleştirme Gerekiyor
      </p>
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
    </div>
  );
}
