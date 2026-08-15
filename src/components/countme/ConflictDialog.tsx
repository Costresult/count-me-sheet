import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useCountMe } from "@/lib/countme/store";

export function ConflictDialog() {
  const conflict = useCountMe((s) => s.conflict);
  const resolveConflict = useCountMe((s) => s.resolveConflict);
  const parsed = useCountMe((s) => s.parsed);
  if (!conflict) return null;

  const col = parsed?.columns.find((c) => c.id === conflict.columnId);
  const row = parsed?.rows.find((r) => r.id === conflict.rowId);
  const identity = parsed?.columns.find((c) => c.kind === "identity");
  const label = identity && row ? String(row.cells[identity.id]?.value ?? row.rowNumber) : conflict.rowId;
  const existingNum = Number(String(conflict.existing ?? "").replace(",", "."));
  const incoming = conflict.value ?? 0;
  const sum = Math.round(((Number.isFinite(existingNum) ? existingNum : 0) + incoming) * 1e6) / 1e6;

  return (
    <AlertDialog open onOpenChange={(o) => !o && resolveConflict("cancel")}>
      <AlertDialogContent data-testid="conflict-dialog">
        <AlertDialogHeader>
          <AlertDialogTitle>Bu hücrede zaten değer var. Ne yapmak istiyorsunuz?</AlertDialogTitle>
          <AlertDialogDescription>
            {label} · Sayfa {conflict.page} ({col?.header ?? ""})
            <br />
            Mevcut değer: <span data-testid="conflict-existing">{String(conflict.existing)}</span>
            <br />
            Yeni değer: <span data-testid="conflict-incoming">{conflict.value === null ? "boş" : conflict.value}</span>
            <br />
            Üstüne eklenirse: <span data-testid="conflict-sum">{sum}</span>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel data-testid="conflict-cancel" onClick={() => resolveConflict("cancel")}>
            İPTAL
          </AlertDialogCancel>
          <AlertDialogAction data-testid="conflict-add" onClick={() => resolveConflict("add")}>
            ÜSTÜNE EKLE
          </AlertDialogAction>
          <AlertDialogAction data-testid="conflict-overwrite" onClick={() => resolveConflict("replace")}>
            ÜZERİNE YAZ
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}