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

  return (
    <AlertDialog open onOpenChange={(o) => !o && resolveConflict(false)}>
      <AlertDialogContent data-testid="conflict-dialog">
        <AlertDialogHeader>
          <AlertDialogTitle>Bu hücrede zaten {String(conflict.existing)} var.</AlertDialogTitle>
          <AlertDialogDescription>
            {label} · Sayfa {conflict.page} ({col?.header ?? ""}) hücresine{" "}
            {conflict.value === null ? "boş" : conflict.value} yazılmak isteniyor. Üzerine yazılsın mı?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => resolveConflict(false)}>İptal</AlertDialogCancel>
          <AlertDialogAction data-testid="conflict-overwrite" onClick={() => resolveConflict(true)}>
            Üzerine Yaz
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}