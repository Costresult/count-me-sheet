import { useState } from "react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useCountMe } from "@/lib/countme/store";
import { parseNumericInput } from "@/lib/countme/calc";
import { Trash2 } from "lucide-react";
import { buildProductIndex } from "@/lib/voice/productIndex";
import { learnAlias, recordCorrection } from "@/lib/voice/aliases";
import { useVoice } from "@/lib/voice/store";
import { StockSearch } from "./StockSearch";

const input =
  "h-9 min-w-0 rounded-md border border-border bg-background px-2 text-[13px] text-foreground";

export function UnmatchedPanel() {
  const open = useCountMe((s) => s.unmatchedOpen);
  const setOpen = useCountMe((s) => s.setUnmatchedOpen);
  const unmatched = useCountMe((s) => s.unmatched);
  const pages = useCountMe((s) => s.pages);
  const parsed = useCountMe((s) => s.parsed);
  const add = useCountMe((s) => s.addUnmatchedProduct);
  const update = useCountMe((s) => s.updateUnmatchedProduct);
  const remove = useCountMe((s) => s.removeUnmatchedProduct);
  const resolve = useCountMe((s) => s.resolveUnmatchedToRow);
  const activeId = useCountMe((s) => s.activeId);
  const refreshAliases = useVoice((s) => s.refreshAliases);

  // A manual match is the strongest learning evidence we have.
  const learnFromManualMatch = async (
    spoken: string,
    rowId: string,
    physicalPage: number,
  ) => {
    const row = buildProductIndex(parsed).find((r) => r.rowId === rowId);
    if (!row || !spoken.trim()) return;
    await learnAlias({
      spokenAlias: spoken,
      targetProductIdentity: row.groupKey,
      targetProductName: row.name,
      targetUnit: row.unitText || null,
      source: "USER_CORRECTION",
    });
    await recordCorrection({
      sessionId: activeId,
      rawTranscript: spoken,
      aiCandidate: null,
      aiRowId: null,
      correctedRowId: row.rowId,
      correctedName: row.label,
      physicalPage,
      unitContext: row.unitText || null,
    });
    await refreshAliases();
  };

  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [unit, setUnit] = useState("");
  const [searchFor, setSearchFor] = useState<string | null>(null);

  const submit = () => {
    const value = parseNumericInput(amount);
    add(name, value === undefined ? null : value, unit, pages.activePage, name.trim());
    setName("");
    setAmount("");
    setUnit("");
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent side="right" className="flex w-full flex-col gap-3 overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Eşleşmeyen / Listede Bulunamayan Ürünler</SheetTitle>
          <SheetDescription>
            Excel’de olmayan ürünler burada saklanır ve dışa aktarımda listenin sonuna eklenir.
            Miktar yalnızca ürünün eklendiği fiziksel sayfanın kolonuna yazılır.
          </SheetDescription>
        </SheetHeader>

        <div className="grid grid-cols-[1fr_70px_80px] gap-2">
          <input
            data-testid="unmatched-name"
            className={input}
            placeholder="Ürün adı"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <input
            data-testid="unmatched-amount"
            className={input}
            inputMode="decimal"
            placeholder="Miktar"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          <input
            data-testid="unmatched-unit"
            className={input}
            placeholder="Birim"
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
          />
        </div>
        <Button data-testid="unmatched-add" onClick={submit} disabled={!name.trim()}>
          Sayfa {pages.activePage} için ekle
        </Button>

        <div className="space-y-3">
          {unmatched.length === 0 && (
            <p className="text-[13px] text-muted-foreground">Kayıt yok.</p>
          )}
          {unmatched.map((u) => (
            <div key={u.id} data-testid="unmatched-item" className="rounded-md border border-border p-2">
              <div className="grid grid-cols-[1fr_70px_80px_auto] items-center gap-2">
                <input
                  className={input}
                  value={u.name}
                  onChange={(e) => update(u.id, { name: e.target.value })}
                />
                <input
                  className={input}
                  inputMode="decimal"
                  value={u.amount ?? ""}
                  onChange={(e) => {
                    const v = parseNumericInput(e.target.value);
                    update(u.id, { amount: v === undefined ? u.amount : v });
                  }}
                />
                <input
                  className={input}
                  value={u.unit}
                  onChange={(e) => update(u.id, { unit: e.target.value })}
                />
                <button
                  type="button"
                  aria-label="Sil"
                  onClick={() => remove(u.id)}
                  className="inline-flex size-9 items-center justify-center rounded-md text-destructive hover:bg-destructive/10"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px] text-muted-foreground">
                <span className="rounded bg-secondary px-1.5 py-0.5 font-medium text-secondary-foreground">
                  Sayfa {u.physicalPage}
                </span>
                <span className="truncate">girdi: “{u.rawInput}”</span>
              </div>
              <div className="mt-2">
                {searchFor === u.id ? (
                  <StockSearch
                    autoFocus
                    testid={`resolve-search-${u.id}`}
                    onSelect={(rowId) => {
                      void learnFromManualMatch(u.rawInput || u.name, rowId, u.physicalPage);
                      resolve(u.id, rowId);
                      setSearchFor(null);
                    }}
                  />
                ) : (
                  <button
                    type="button"
                    data-testid={`resolve-open-${u.id}`}
                    onClick={() => setSearchFor(u.id)}
                    className="h-9 w-full rounded-md border border-border bg-secondary px-2 text-[13px] font-medium text-secondary-foreground hover:bg-accent"
                  >
                    Mevcut ürünle eşleştir…
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}
