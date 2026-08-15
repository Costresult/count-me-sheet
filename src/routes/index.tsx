import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { Toolbar } from "@/components/countme/Toolbar";
import { SheetGrid } from "@/components/countme/SheetGrid";
import { EmptyState } from "@/components/countme/EmptyState";
import { InventorySidebar } from "@/components/countme/InventorySidebar";
import { PageBar, MobilePageBar } from "@/components/countme/PageBar";
import { PageMappingDialog } from "@/components/countme/PageMappingDialog";
import { ConflictDialog } from "@/components/countme/ConflictDialog";
import { UnmatchedPanel } from "@/components/countme/UnmatchedPanel";
import { CompleteDialog } from "@/components/countme/CompleteDialog";
import { MobileVoiceFab } from "@/components/countme/VoicePanel";
import { VoiceDecisionPopup } from "@/components/countme/VoiceDecisionPopup";
import { VoiceMemoryPanel } from "@/components/countme/VoiceMemoryPanel";
import { VoiceHotkeys } from "@/components/countme/VoiceHotkeys";
import { useVoice } from "@/lib/voice/store";
import { useCountMe } from "@/lib/countme/store";

export const Route = createFileRoute("/")({
  component: Index,
  head: () => ({
    meta: [
      { title: "Count Me — Excel Tabanlı Envanter Sayım Aracı" },
      {
        name: "description",
        content:
          "Excel dosyanızı yükleyin, tabloyu doğrudan düzenleyin ve restoran, bar, otel ve mutfaklar için hızlı envanter sayımı yapın.",
      },
      { property: "og:title", content: "Count Me — Excel Tabanlı Envanter Sayım Aracı" },
      {
        property: "og:description",
        content: "Excel çalışma sayfanız arayüzünüz olsun: hızlı, güvenli ve formül korumalı envanter sayımı.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

function Index() {
  const parsed = useCountMe((s) => s.parsed);
  const init = useCountMe((s) => s.init);

  useEffect(() => {
    void init();
  }, [init]);

  // test/automation hook for the physical page engine (also used by future voice AI)
  useEffect(() => {
    const w = window as unknown as { countme?: unknown; countmeVoice?: unknown };
    w.countme = useCountMe;
    w.countmeVoice = useVoice;
    return () => {
      delete w.countme;
      delete w.countmeVoice;
    };
  }, []);

  return (
    <div className="flex h-[100dvh] w-full overflow-hidden bg-background">
      <InventorySidebar />
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Toolbar />
        {parsed && <PageBar />}
        <div className="min-h-0 flex-1">{parsed ? <SheetGrid /> : <EmptyState />}</div>
        {parsed && <MobilePageBar />}
      </main>
      <PageMappingDialog />
      <ConflictDialog />
      <UnmatchedPanel />
      <CompleteDialog />
      <VoiceDecisionPopup />
      <MobileVoiceFab />
      <VoiceMemoryPanel />
      <VoiceHotkeys />
    </div>
  );
}
