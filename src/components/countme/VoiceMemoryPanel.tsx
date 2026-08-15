import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Trash2 } from "lucide-react";
import { useVoice } from "@/lib/voice/store";

/** Review / delete learned pronunciations so a wrong correction can be undone. */
export function VoiceMemoryPanel() {
  const open = useVoice((s) => s.panelOpen);
  const setOpen = useVoice((s) => s.setPanelOpen);
  const aliases = useVoice((s) => s.aliases);
  const forget = useVoice((s) => s.forgetAlias);
  const entries = useVoice((s) => s.entries);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent side="right" className="flex w-full flex-col gap-3 overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Öğrenilen Telaffuzlar</SheetTitle>
          <SheetDescription>
            Sizin seçimlerinizden öğrenilen eşleştirmeler. Yanlış bir öğrenmeyi buradan silebilirsiniz.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-2">
          {aliases.length === 0 && <p className="text-[13px] text-muted-foreground">Henüz kayıt yok.</p>}
          {aliases
            .slice()
            .sort((a, b) => b.lastUsed - a.lastUsed)
            .map((a) => (
              <div
                key={a.id}
                data-testid="alias-item"
                className="flex items-center gap-2 rounded-md border border-border p-2 text-[13px]"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">“{a.spokenAlias}” → {a.targetProductName}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {a.correctionCount}× · güven {Math.round(a.confidence * 100)}%
                    {a.targetUnit ? ` · ${a.targetUnit}` : ""}
                  </p>
                </div>
                <button
                  type="button"
                  aria-label="Sil"
                  onClick={() => void forget(a.id)}
                  className="inline-flex size-8 items-center justify-center rounded-md text-destructive hover:bg-destructive/10"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            ))}
        </div>

        <div>
          <h3 className="mb-1 text-[13px] font-semibold">Son ses kayıtları</h3>
          <div className="space-y-1">
            {entries.slice(0, 15).map((e) => (
              <p key={e.id} className="text-[12px] text-muted-foreground">
                <span className="font-medium text-foreground">S{e.physicalPage}</span> “{e.rawTranscript}” · {e.outcome}
                {e.detail ? ` · ${e.detail}` : ""}
              </p>
            ))}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
