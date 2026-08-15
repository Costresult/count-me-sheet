import { useEffect } from "react";
import {
  Mic,
  MicOff,
  Pause,
  Play,
  Square,
  Radio,
  Hand,
  Brain,
  Loader2,
} from "lucide-react";
import { useVoice, type VoiceState } from "@/lib/voice/store";
import { useCountMe } from "@/lib/countme/store";
import { cn } from "@/lib/utils";

const stateLabel: Record<VoiceState, string> = {
  IDLE: "Hazır",
  LISTENING: "Dinliyor",
  PROCESSING: "İşleniyor",
  PAUSED: "Bekliyor",
  PAUSED_BY_USER: "Kullanıcı durdurdu",
  ERROR: "Hata",
};

function Btn({
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
        "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-[12px] font-semibold transition-colors",
        tone === "primary"
          ? "bg-primary text-primary-foreground hover:bg-primary/90"
          : tone === "danger"
            ? "bg-destructive/15 text-destructive hover:bg-destructive/25"
            : active
              ? "bg-primary/15 text-primary"
              : "bg-secondary text-secondary-foreground hover:bg-accent",
      )}
    >
      <Icon className="size-4" />
      <span className="whitespace-nowrap">{label}</span>
    </button>
  );
}

export function VoiceBar() {
  const v = useVoice();
  const parsed = useCountMe((s) => s.parsed);
  const page = useCountMe((s) => s.pages.activePage);
  const refreshAliases = useVoice((s) => s.refreshAliases);

  useEffect(() => {
    void refreshAliases();
  }, [refreshAliases]);

  if (!parsed) return null;
  const last = v.entries[0];

  return (
    <div className="flex flex-wrap items-center gap-1.5 border-b border-border bg-card px-2 py-1.5">
      <span className="inline-flex items-center gap-1 text-[12px] font-black tracking-tight text-primary">
        <Mic className="size-4" /> SES
      </span>

      <Btn
        testid="voice-mode-continuous"
        icon={Radio}
        label="SÜREKLİ DİNLE"
        active={v.mode === "continuous"}
        onClick={() => v.setMode("continuous")}
      />
      <Btn
        testid="voice-mode-push"
        icon={Hand}
        label="BAS-KONUŞ"
        active={v.mode === "push"}
        onClick={() => v.setMode("push")}
      />

      {v.mode === "continuous" ? (
        v.state === "LISTENING" || v.state === "PROCESSING" ? (
          <>
            <Btn testid="voice-pause" icon={Pause} label="BEKLE" onClick={() => v.pauseListening(false)} />
            <Btn testid="voice-stop" icon={Square} label="DUR" tone="danger" onClick={v.stopListening} />
          </>
        ) : v.state === "PAUSED" || v.state === "PAUSED_BY_USER" ? (
          <>
            <Btn testid="voice-resume" icon={Play} label="DEVAM" tone="primary" onClick={v.resumeListening} />
            <Btn testid="voice-stop" icon={Square} label="DUR" tone="danger" onClick={v.stopListening} />
          </>
        ) : (
          <Btn testid="voice-start" icon={Mic} label="MİKROFON / DİNLE" tone="primary" onClick={() => void v.startListening()} />
        )
      ) : (
        <Btn
          testid="voice-ptt"
          icon={v.state === "LISTENING" ? Mic : MicOff}
          label={v.state === "LISTENING" ? "KONUŞUN…" : "BAS & KONUŞ"}
          tone={v.state === "LISTENING" ? "primary" : "ghost"}
          onPointerDown={() => void v.pushToTalkStart()}
          onPointerUp={v.pushToTalkEnd}
        />
      )}

      <span
        data-testid="voice-state"
        className={cn(
          "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold",
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

      <div className="min-w-[140px] flex-1 truncate text-[12px] text-muted-foreground" data-testid="voice-transcript">
        {v.interim
          ? `Duyuluyor: ${v.interim}`
          : last
            ? `Heard: ${last.rawTranscript}${last.detail ? ` → ${last.detail}` : ""}`
            : "Ürünleri okumaya başlayın."}
      </div>

      <Btn
        testid="voice-memory"
        icon={Brain}
        label={`ÖĞRENİLENLER${v.aliases.length ? ` (${v.aliases.length})` : ""}`}
        onClick={() => v.setPanelOpen(true)}
      />

      {v.error && (
        <span className="w-full text-[12px] font-medium text-destructive" data-testid="voice-error">
          {v.error}
        </span>
      )}
    </div>
  );
}
