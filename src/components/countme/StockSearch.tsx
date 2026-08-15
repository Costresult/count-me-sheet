import { useMemo, useState } from "react";
import { useCountMe } from "@/lib/countme/store";
import { buildProductIndex } from "@/lib/voice/productIndex";
import { searchStock } from "@/lib/voice/stockSearch";
import { Search } from "lucide-react";

/** 2-character autocomplete over the real STOK MALI column (never stock groups). */
export function StockSearch({
  onSelect,
  autoFocus,
  testid = "stock-search",
}: {
  onSelect: (rowId: string) => void;
  autoFocus?: boolean;
  testid?: string;
}) {
  const parsed = useCountMe((s) => s.parsed);
  const [q, setQ] = useState("");
  const index = useMemo(() => buildProductIndex(parsed), [parsed]);
  const hits = useMemo(() => searchStock(index, q, 30), [index, q]);

  return (
    <div className="flex min-h-0 flex-col gap-1.5">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          data-testid={`${testid}-input`}
          autoFocus={autoFocus}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Stok malı ara…"
          className="h-9 w-full rounded-md border border-border bg-background pl-7 pr-2 text-[13px] text-foreground"
        />
      </div>
      {q.trim().length < 2 ? (
        <p className="px-1 text-[11px] text-muted-foreground">En az 2 harf yazın.</p>
      ) : hits.length === 0 ? (
        <p className="px-1 text-[11px] text-muted-foreground">Sonuç yok.</p>
      ) : (
        <div
          data-testid={`${testid}-results`}
          className="max-h-56 min-h-0 overflow-y-auto rounded-md border border-border"
        >
          {hits.map((h) => (
            <button
              key={h.row.rowId}
              type="button"
              data-testid="stock-search-result"
              onClick={() => onSelect(h.row.rowId)}
              className="block w-full border-b border-border/60 px-2 py-1.5 text-left last:border-b-0 hover:bg-secondary"
            >
              <span className="block truncate text-[13px] font-semibold text-foreground">
                {h.row.name}
              </span>
              <span className="block truncate text-[11px] text-muted-foreground">
                {h.row.unitText || "birim yok"} · satır {h.row.rowNumber}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
