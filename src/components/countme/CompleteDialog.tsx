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

export function CompleteDialog() {
  const open = useCountMe((s) => s.completeOpen);
  const setOpen = useCountMe((s) => s.setCompleteOpen);
  const complete = useCountMe((s) => s.completeInventory);

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Bu envanteri tamamlamak istiyor musunuz?</AlertDialogTitle>
          <AlertDialogDescription>
            Envanter kaydedilecek, durumu “Tamamlandı” olacak ve final Excel dosyası indirilecek.
            Orijinal yüklediğiniz dosya değiştirilmez.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Vazgeç</AlertDialogCancel>
          <AlertDialogAction data-testid="confirm-complete" onClick={() => void complete()}>
            Envanteri Bitir
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
