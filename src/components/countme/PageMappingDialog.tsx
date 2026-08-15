import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useCountMe } from "@/lib/countme/store";
import { eligibleCountColumns } from "@/lib/countme/pages";

export function PageMappingDialog() {
  const open = useCountMe((s) => s.mappingOpen);
  const setOpen = useCountMe((s) => s.setMappingOpen);
  const parsed = useCountMe((s) => s.parsed);
  const pages = useCountMe((s) => s.pages);
  const setPageColumn = useCountMe((s) => s.setPageColumn);
  const setPageCount = useCountMe((s) => s.setPageCount);

  const options = eligibleCountColumns(parsed);
  const list = Array.from({ length: pages.pageCount }, (_, i) => i + 1);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Sayım Kolonlarını Ayarla</DialogTitle>
          <DialogDescription>
            Her fiziksel sayım kağıdını Excel’deki ayrı bir sayım kolonuna eşleyin. TOPLAM kolonları
            listelenmez.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2 text-[13px]">
          <span className="text-muted-foreground">Sayfa Sayısı:</span>
          <Button size="sm" variant="secondary" onClick={() => setPageCount(pages.pageCount - 1)}>
            −
          </Button>
          <span className="w-8 text-center font-semibold tabular-nums">{pages.pageCount}</span>
          <Button size="sm" variant="secondary" onClick={() => setPageCount(pages.pageCount + 1)}>
            +
          </Button>
          <span className="ml-auto text-[12px] text-muted-foreground">
            {options.length} uygun kolon
          </span>
        </div>

        <div className="space-y-2">
          {list.map((p) => {
            const value = pages.pageColumns[p] ?? "";
            return (
              <div key={p} className="flex items-center gap-2">
                <span className="w-20 shrink-0 text-[13px] font-medium">Sayfa {p}</span>
                <select
                  data-testid={`map-page-${p}`}
                  value={value}
                  onChange={(e) => setPageColumn(p, e.target.value || null)}
                  className="h-9 min-w-0 flex-1 rounded-md border border-border bg-background px-2 text-[13px]"
                >
                  <option value="">— eşleme yok —</option>
                  {options.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.letter} · {c.header}
                    </option>
                  ))}
                </select>
              </div>
            );
          })}
          {options.length < pages.pageCount && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-[12px] text-destructive">
              Uygun boş sayım kolonu yetersiz. Fazla sayfalar için Excel’de kolon açın veya eşlemeyi
              elle seçin.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button onClick={() => setOpen(false)}>Tamam</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}