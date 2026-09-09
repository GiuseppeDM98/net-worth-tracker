import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { TILE_EYEBROW_CLASS } from '@/components/ui/tile';

interface LogoutDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}

/**
 * The one confirm that stays an `AlertDialog` rather than becoming a `ResponsiveModal`: it
 * interrupts, so it wants `role="alertdialog"` and the initial focus on «Annulla». It takes
 * the modal vocabulary anyway — eyebrow, 20px title, reading line — because a surface that
 * looked like a different kind of object would read as coming from somewhere else.
 */
export function LogoutDialog({ open, onOpenChange, onConfirm }: LogoutDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader className="gap-1.5 text-left">
          <p className={TILE_EYEBROW_CLASS}>Account</p>
          <AlertDialogTitle className="text-[20px] font-semibold leading-[1.25] tracking-[-0.01em]">
            Esci dall&apos;account?
          </AlertDialogTitle>
          <AlertDialogDescription className="mt-1 text-[13px] leading-[1.45] text-foreground">
            Esci solo da questo dispositivo. I dati restano dove sono e rientri con le stesse
            credenziali.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Annulla</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>Esci</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
