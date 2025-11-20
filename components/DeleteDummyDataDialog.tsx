'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { getDummyDataCount, deleteAllDummyData, type DummyDataCount } from '@/lib/services/dummyDataService';
import { toast } from 'sonner';
import { AlertTriangle, Loader2 } from 'lucide-react';

interface DeleteDummyDataDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  onDeleted?: () => void; // Callback after successful deletion
}

export function DeleteDummyDataDialog({
  open,
  onOpenChange,
  userId,
  onDeleted,
}: DeleteDummyDataDialogProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [dataCount, setDataCount] = useState<DummyDataCount | null>(null);

  // Load count when dialog opens
  useEffect(() => {
    if (open) {
      loadDataCount();
    }
  }, [open, userId]);

  const loadDataCount = async () => {
    setIsLoading(true);
    try {
      const count = await getDummyDataCount(userId);
      setDataCount(count);
    } catch (error) {
      console.error('Error loading dummy data count:', error);
      toast.error('Errore nel caricamento del conteggio dati');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!dataCount || dataCount.total === 0) {
      toast.info('Nessun dato dummy da eliminare');
      return;
    }

    setIsDeleting(true);

    try {
      const result = await deleteAllDummyData(userId);

      toast.success(
        `Eliminati con successo: ${result.snapshots} snapshot, ${result.expenses} spese, ${result.categories} categorie (${result.total} totali)`
      );

      onOpenChange(false);

      // Call the callback to refresh data
      if (onDeleted) {
        onDeleted();
      }
    } catch (error) {
      console.error('Error deleting dummy data:', error);
      toast.error('Errore durante l\'eliminazione dei dati');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Elimina Tutti i Dati Dummy
          </DialogTitle>
          <DialogDescription>
            Questa operazione eliminerà permanentemente tutti i dati di test dal tuo account.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : dataCount ? (
            <>
              {dataCount.total === 0 ? (
                <Alert>
                  <AlertDescription>
                    Non ci sono dati dummy da eliminare.
                  </AlertDescription>
                </Alert>
              ) : (
                <>
                  <div className="rounded-lg border p-4 space-y-2">
                    <h3 className="text-sm font-semibold">Dati da Eliminare:</h3>
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Snapshot:</span>
                        <span className="font-medium">{dataCount.snapshots}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Spese/Entrate:</span>
                        <span className="font-medium">{dataCount.expenses}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Categorie:</span>
                        <span className="font-medium">{dataCount.categories}</span>
                      </div>
                      <div className="flex justify-between pt-2 mt-2 border-t">
                        <span className="font-semibold">Totale:</span>
                        <span className="font-semibold">{dataCount.total}</span>
                      </div>
                    </div>
                  </div>

                  <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>
                      <strong>Attenzione:</strong> Questa azione è irreversibile.
                      Tutti i dati verranno eliminati permanentemente.
                    </AlertDescription>
                  </Alert>
                </>
              )}
            </>
          ) : null}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isDeleting}
          >
            Annulla
          </Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={isLoading || isDeleting || !dataCount || dataCount.total === 0}
          >
            {isDeleting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Eliminazione...
              </>
            ) : (
              'Elimina Tutto'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
