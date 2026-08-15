import { useEffect, useState } from "react";
import { Mic, MicOff, Pause, Play, Radio, Hand, Undo2, Brain, ListPlus, Loader2 } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useVoice, type VoiceState } from "@/lib/voice/store";
import { useCountMe } from "@/lib/countme/store";
import { cn } from "@/lib/utils";

const stateLabel: Record<VoiceState, string> = {
  IDLE: "HAZIR",
  LISTENING: "DİNLİYOR",
  PROCESSING: "İŞLENİYOR",
  PAUSED: "BEKLİYOR",
  PAUSED_BY_USER: "KULLANICI MÜDAHALESİ",
  WAITING_FOR_USER: "SEÇİM BEKLENİYOR",
  CANCELLED: "İPTAL EDİLDİ",
  ERROR: "HATA",
};

function VBtn({
  onClick,
  icon: Icon,
  label,
  active,
  tone = "ghost",
  testid,
  onPointerDown,
  onPointerUp,
}: {
  onClick?: () => void;
  icon: typeof Mic;
  label: string;
  active?: boolean;
  tone?: "ghost" | "primary" | "danger";
  testid?: string;
  onPointerDown?: () => void;
  onPointerUp?: () => void;
}) {
  return (
    <button
      type="button"
      data-testid={testid}
      onClick={onClick}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerUp}
      className={cn(
        "inline-flex w-full items-center gap-1.5 rounded-md px-2 py-2 text-[12px] font-semibold transition-colors",
        tone === "primary"
          ? "bg-primary text-primary-foreground hover:bg-primary/90"
          : tone === "danger"
            ? "bg-destructive/15 text-destructive hover:bg-destructive/25"
            : active
              ? "bg-primary/15 text-primary"
              : "bg-secondary text-secondary-foreground hover:bg-accent",
      )}
    >
      <Icon className="size-4 shrink-0" />
      <span className="truncate">{label}</span>
    </button>
  );
}

/** Vertical SESLİ SAYIM controls – lives in the sidebar so the sheet keeps its width. */
export function VoicePanel() {
  const v = useVoice();
  const parsed = useCountMe((s) => s.parsed);
  const page = useCountMe((s) => s.pages.activePage);
  const unmatched = useCountMe((s) => s.unmatched);
  const setUnmatchedOpen = useCountMe((s) => s.setUnmatchedOpen);
  const undo = useCountMe((s) => s.undoLast);
  const refreshAliases = useVoice((s) => s.refreshAliases);

  useEffect(() => {
    void refreshAliases();
  }, [refreshAliases]);

  if (!parsed) return null;
  const last = v.entries[0];
  const listening = v.state === "LISTENING" || v.state === "PROCESSING";

  return (
    <div className="flex flex-col gap-1.5 border-t border-border px-2 py-2" data-testid="voice-panel">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-primary">
        <Mic className="size-3.5" /> Sesli Sayım
      </div>

      <span
        data-testid="voice-state"
        className={cn(
          "inline-flex items-center gap-1 self-start rounded-full px-2 py-0.5 text-[11px] font-semibold",
          v.state === "LISTENING"
            ? "bg-primary/15 text-primary"
            : v.state === "ERROR"
              ? "bg-destructive/15 text-destructive"
              : "bg-secondary text-secondary-foreground",
        )}
      >
        {v.state === "PROCESSING" && <Loader2 className="size-3 animate-spin" />}
        {stateLabel[v.state]}
        {v.queueLength > 0 && <span className="tabular-nums">· {v.queueLength}</span>}
        <span className="text-muted-foreground">· S{page}</span>
      </span>

      <VBtn
        testid="voice-mode-continuous"
        icon={Radio}
        label="SÜREKLİ DİNLE"
        active={v.mode === "continuous"}
        onClick={() => v.setMode("continuous")}
      />
      <VBtn
        testid="voice-mode-push"
        icon={Hand}
        label="BAS-KONUŞ"
        active={v.mode === "push"}
        onClick={() => v.setMode("push")}
      />

      {v.mode === "continuous" ? (
        listening ? (
          <VBtn testid="voice-stop" icon={MicOff} label="MİKROFON KAPAT" tone="danger" onClick={v.stopListening} />
        ) : (
          <VBtn
            testid="voice-start"
            icon={Mic}
            label="MİKROFON AÇ"
            tone="primary"
            onClick={() => void v.startListening()}
          />
        )
      ) : (
        <VBtn
          testid="voice-ptt"
          icon={v.state === "LISTENING" ? Mic : MicOff}
          label={v.state === "LISTENING" ? "KONUŞUN…" : "BAS & KONUŞ"}
          tone={v.state === "LISTENING" ? "primary" : "ghost"}
          onPointerDown={() => void v.pushToTalkStart()}
          onPointerUp={v.pushToTalkEnd}
        />
      )}

      <div className="rounded-md bg-secondary/50 px-2 py-1.5">
        <p className="text-[10px] font-semibold uppercase text-muted-foreground">Son duyulan</p>
        <p className="truncate text-[12px] text-foreground" data-testid="voice-transcript">
          {v.interim || (last ? last.rawTranscript : "—")}
        </p>
        {last?.detail && <p className="truncate text-[11px] text-muted-foreground">{last.detail}</p>}
      </div>

      <div className="flex flex-col gap-1">
        <VBtn testid="voice-pause" icon={Pause} label="BEKLE" onClick={() => v.pauseListening(false)} />
        <VBtn testid="voice-resume" icon={Play} label="DEVAM" onClick={v.resumeListening} />
        <VBtn testid="voice-undo" icon={Undo2} label="GERİ AL" onClick={undo} />
      </div>

      <div className="mt-1 flex flex-col gap-1">
        <VBtn
          testid="open-unmatched"
          icon={ListPlus}
          label={`EŞLEŞMEYENLER${unmatched.length ? ` (${unmatched.length})` : ""}`}
          onClick={() => setUnmatchedOpen(true)}
        />
        <VBtn
          testid="voice-memory"
          icon={Brain}
          label={`ÖĞRENİLENLER${v.aliases.length ? ` (${v.aliases.length})` : ""}`}
          onClick={() => v.setPanelOpen(true)}
        />
      </div>

      {v.error && (
        <span className="text-[11px] font-medium text-destructive" data-testid="voice-error">
          {v.error}
        </span>
      )}
    </div>
  );
}

/** Mobile: small floating mic that expands the voice controls in a bottom sheet. */
export function MobileVoiceFab() {
  const [open, setOpen] = useState(false);
  const parsed = useCountMe((s) => s.parsed);
  const state = useVoice((s) => s.state);
  if (!parsed) return null;

  return (
    <>
      <button
        type="button"
        data-testid="mobile-voice-fab"
        aria-label="Sesli sayım"
        onClick={() => setOpen(true)}
        className={cn(
          "fixed bottom-20 right-3 z-40 inline-flex size-12 items-center justify-center rounded-full shadow-lg md:hidden",
          state === "LISTENING" ? "bg-primary text-primary-foreground" : "bg-card text-primary border border-border",
        )}
      >
        <Mic className="size-5" />
      </button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="max-h-[80dvh] overflow-y-auto p-0">
          <SheetHeader className="sr-only">
            <SheetTitle>Sesli Sayım</SheetTitle>
          </SheetHeader>
          <VoicePanel />
        </SheetContent>
      </Sheet>
    </>
  );
}
