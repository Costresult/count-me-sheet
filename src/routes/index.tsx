import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { Toolbar } from "@/components/countme/Toolbar";
import { SheetGrid } from "@/components/countme/SheetGrid";
import { EmptyState } from "@/components/countme/EmptyState";
import { FocusDemoBar } from "@/components/countme/FocusDemoBar";
import { InventorySidebar } from "@/components/countme/InventorySidebar";
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

  return (
    <div className="flex h-[100dvh] w-full overflow-hidden bg-background">
      <InventorySidebar />
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Toolbar />
        <div className="min-h-0 flex-1">{parsed ? <SheetGrid /> : <EmptyState />}</div>
        {parsed && <FocusDemoBar />}
      </main>
    </div>
  );
}
