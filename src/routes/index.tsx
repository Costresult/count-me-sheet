import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { Toolbar } from "@/components/countme/Toolbar";
import { SheetGrid } from "@/components/countme/SheetGrid";
import { EmptyState } from "@/components/countme/EmptyState";
import { FocusDemoBar } from "@/components/countme/FocusDemoBar";
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
  const restore = useCountMe((s) => s.restore);

  useEffect(() => {
    void restore();
  }, [restore]);

  return (
    <main className="flex h-[100dvh] w-full flex-col overflow-hidden bg-background">
      <Toolbar />
      <div className="min-h-0 flex-1">{parsed ? <SheetGrid /> : <EmptyState />}</div>
      {parsed && <FocusDemoBar />}
    </main>
  );
}
