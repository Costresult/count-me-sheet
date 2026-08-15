import { useVoice } from "@/lib/voice/store";
import { useCountMe } from "@/lib/countme/store";

/** Compact ambiguity picker – never covers more than the bottom strip of the sheet. */
export function VoiceCandidates() {
  const prompt = useVoice((s) => s.prompt);
  const choose = useVoice((s) => s.chooseCandidate);
  const dismiss = useVoice((s) => s.dismissPrompt);
  const focusRow = useCountMe((s) => s.focusProductRow);
  if (!prompt) return null;

  return (
    <div
      data-testid="voice-candidates"
      className="pointer-events-auto fixed inset-x-2 bottom-2 z-50 mx-auto max-w-2xl rounded-lg border border-border bg-card p-2 shadow-xl"
    >
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <p className="truncate text-[12px] text-muted-foreground">
          {prompt.kind === "unit" ? "Hangi birim satırı?" : "Hangi ürün?"} · “
          {prompt.utterance.rawTranscript}”
        </p>
        <button
          type="button"
          data-testid="voice-candidates-dismiss"
          onClick={() => dismiss(true)}
          className="shrink-0 rounded-md bg-secondary px-2 py-1 text-[12px] font-medium text-secondary-foreground"
        >
          Eşleşmeyene gönder
        </button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {prompt.options.map((o, i) => (
          <button
            key={o.rowId}
            type="button"
            data-testid={`voice-candidate-${i}`}
            onPointerEnter={() => focusRow(o.rowId)}
            onClick={() => void choose(i)}
            className="inline-flex max-w-full items-center gap-1.5 rounded-md bg-primary/10 px-2.5 py-2 text-left text-[13px] font-semibold text-primary hover:bg-primary/20"
          >
            <span className="rounded bg-primary px-1.5 text-[11px] text-primary-foreground">{i + 1}</span>
            <span className="truncate">{o.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
