'use client';

import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { BanknoteArrowDown, BanknoteArrowUp, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/contexts/AuthContext';
import { useAssets } from '@/lib/hooks/useAssets';
import { useInvestmentOperations } from '@/lib/hooks/useInvestmentOperations';
import {
  createInvestmentOperation,
  deleteInvestmentOperation,
  updateInvestmentOperation,
} from '@/lib/services/investmentOperationService';
import { queryKeys } from '@/lib/query/queryKeys';
import { formatCurrency, formatDate } from '@/lib/utils/formatters';
import { toDate } from '@/lib/utils/dateHelpers';
import { InvestmentOperationType } from '@/types/investments';

const OPERATION_LABELS: Record<InvestmentOperationType, string> = {
  buy: 'Acquisto',
  sell: 'Vendita',
  contribution: 'Carico quote',
  withdrawal: 'Scarico quote',
  fee: 'Commissione',
  tax: 'Tassa',
};

const FORM_OPERATION_TYPES: InvestmentOperationType[] = ['buy', 'sell'];

export function InvestmentOperationsTab() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: assets = [] } = useAssets(user?.uid);
  const { data: operations = [], isLoading } = useInvestmentOperations(user?.uid);

  const investmentAssets = useMemo(
    () => assets.filter(asset => asset.assetClass !== 'cash').sort((a, b) => a.name.localeCompare(b.name, 'it')),
    [assets]
  );
  const cashAssets = useMemo(
    () => assets.filter(asset => asset.assetClass === 'cash').sort((a, b) => a.name.localeCompare(b.name, 'it')),
    [assets]
  );

  const [assetId, setAssetId] = useState('__none__');
  const [type, setType] = useState<InvestmentOperationType>('buy');
  const [cashAssetId, setCashAssetId] = useState('__none__');
  const [quantity, setQuantity] = useState('');
  const [pricePerUnit, setPricePerUnit] = useState('');
  const [fees, setFees] = useState('');
  const [taxes, setTaxes] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | undefined>();
  const [editingId, setEditingId] = useState<string | undefined>();

  const selectedAsset = investmentAssets.find(asset => asset.id === assetId);
  const grossAmount = Number(quantity) * Number(pricePerUnit);

  const invalidate = async () => {
    if (!user) return;
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.assets.all(user.uid) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.assets.operations(user.uid) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.assets.realized(user.uid) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.overview(user.uid) }),
    ]);
  };

  const resetForm = () => {
    setEditingId(undefined);
    setAssetId('__none__');
    setType('buy');
    setCashAssetId('__none__');
    setQuantity('');
    setPricePerUnit('');
    setFees('');
    setTaxes('');
    setNotes('');
  };

  const handleSubmit = async () => {
    if (!user) return;

    const parsedQuantity = Number(quantity);
    const parsedPrice = Number(pricePerUnit);
    const parsedFees = fees ? Number(fees) : 0;
    const parsedTaxes = taxes ? Number(taxes) : 0;

    if (assetId === '__none__') {
      toast.error('Seleziona un asset investimento');
      return;
    }
    if (!Number.isFinite(parsedQuantity) || parsedQuantity <= 0) {
      toast.error('Inserisci una quantità valida');
      return;
    }
    if (!Number.isFinite(parsedPrice) || parsedPrice < 0) {
      toast.error('Inserisci un prezzo unitario valido');
      return;
    }
    if (!Number.isFinite(parsedFees) || parsedFees < 0 || !Number.isFinite(parsedTaxes) || parsedTaxes < 0) {
      toast.error('Commissioni e tasse devono essere positive o pari a zero');
      return;
    }

    try {
      setIsSaving(true);
      const payload = {
        assetId,
        type,
        date: new Date(`${date}T00:00:00`),
        quantity: parsedQuantity,
        pricePerUnit: parsedPrice,
        fees: parsedFees,
        taxes: parsedTaxes,
        currency: selectedAsset?.currency || 'EUR',
        cashAssetId: cashAssetId !== '__none__' ? cashAssetId : undefined,
        notes: notes.trim() || undefined,
      };
      if (editingId) {
        await updateInvestmentOperation(editingId, payload);
      } else {
        await createInvestmentOperation(user.uid, payload);
      }
      await invalidate();
      resetForm();
      toast.success(editingId ? 'Operazione investimento aggiornata' : 'Operazione investimento registrata');
    } catch (error) {
      console.error('Error creating investment operation:', error);
      toast.error(error instanceof Error ? error.message : 'Errore nel salvataggio dell operazione');
    } finally {
      setIsSaving(false);
    }
  };

  const handleEdit = (operationId: string) => {
    const operation = operations.find(item => item.id === operationId);
    if (!operation) return;

    setEditingId(operation.id);
    setAssetId(operation.assetId);
    setType(operation.type);
    setCashAssetId(operation.cashAssetId || '__none__');
    setQuantity(String(operation.quantity));
    setPricePerUnit(String(operation.pricePerUnit));
    setFees(operation.fees ? String(operation.fees) : '');
    setTaxes(operation.taxes ? String(operation.taxes) : '');
    setDate(toDate(operation.date).toISOString().slice(0, 10));
    setNotes(operation.notes || '');
  };

  const handleDelete = async (operationId: string) => {
    try {
      setDeletingId(operationId);
      await deleteInvestmentOperation(operationId);
      await invalidate();
      toast.success('Operazione eliminata');
    } catch (error) {
      console.error('Error deleting investment operation:', error);
      toast.error(error instanceof Error ? error.message : 'Errore nell eliminazione dell operazione');
    } finally {
      setDeletingId(undefined);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Operazioni Investimento</h2>
        <p className="text-muted-foreground mt-1">
          Registra acquisti e vendite senza classificarli come entrate, spese o debiti
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {type === 'sell' ? <BanknoteArrowUp className="h-5 w-5" /> : <BanknoteArrowDown className="h-5 w-5" />}
            {editingId ? 'Modifica operazione' : 'Nuova operazione'}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 desktop:grid-cols-6 desktop:items-end">
          <div className="space-y-2 desktop:col-span-2">
            <Label>Asset</Label>
            <Select value={assetId} onValueChange={setAssetId} disabled={!!editingId}>
              <SelectTrigger>
                <SelectValue placeholder="Seleziona asset" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Seleziona asset</SelectItem>
                {investmentAssets.map(asset => (
                  <SelectItem key={asset.id} value={asset.id}>
                    {asset.name} ({asset.ticker})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Tipo</Label>
            <Select value={type} onValueChange={(value) => setType(value as InvestmentOperationType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FORM_OPERATION_TYPES.map(operationType => (
                  <SelectItem key={operationType} value={operationType}>{OPERATION_LABELS[operationType]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Quote</Label>
            <Input type="number" min="0" step="0.0001" value={quantity} onChange={(event) => setQuantity(event.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Prezzo unitario</Label>
            <Input type="number" min="0" step="0.0001" value={pricePerUnit} onChange={(event) => setPricePerUnit(event.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Data</Label>
            <Input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          </div>
          <div className="space-y-2 desktop:col-span-2">
            <Label>Conto cash collegato</Label>
            <Select value={cashAssetId} onValueChange={setCashAssetId}>
              <SelectTrigger>
                <SelectValue placeholder="Nessun conto" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Nessun conto</SelectItem>
                {cashAssets.map(asset => (
                  <SelectItem key={asset.id} value={asset.id}>{asset.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Commissioni</Label>
            <Input type="number" min="0" step="0.01" value={fees} onChange={(event) => setFees(event.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Tasse</Label>
            <Input type="number" min="0" step="0.01" value={taxes} onChange={(event) => setTaxes(event.target.value)} />
          </div>
          <div className="space-y-2 desktop:col-span-2">
            <Label>Note</Label>
            <Input value={notes} onChange={(event) => setNotes(event.target.value)} />
          </div>
          <Button onClick={handleSubmit} disabled={isSaving || investmentAssets.length === 0} className="desktop:col-span-1">
            <Plus className="mr-2 h-4 w-4" />
            {editingId ? 'Aggiorna' : 'Registra'}
          </Button>
          {editingId && (
            <Button type="button" variant="outline" onClick={resetForm} className="desktop:col-span-1">
              Annulla
            </Button>
          )}
          {Number.isFinite(grossAmount) && grossAmount > 0 && (
            <p className="text-sm text-muted-foreground desktop:col-span-5">
              Controvalore lordo: {formatCurrency(grossAmount)}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Storico operazioni</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Caricamento operazioni...</p>
          ) : operations.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nessuna operazione investimento registrata.</p>
          ) : (
            <div className="space-y-3">
              {operations.map(operation => (
                <div key={operation.id} className="flex flex-col gap-3 rounded-md border p-3 desktop:flex-row desktop:items-center desktop:justify-between">
                  <div className="min-w-0">
                    <p className="font-medium">
                      {OPERATION_LABELS[operation.type]} {operation.assetName}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(toDate(operation.date))} · {operation.quantity} quote · {formatCurrency(operation.pricePerUnit)}
                    </p>
                    {operation.cashAssetId && (
                      <p className="text-xs text-muted-foreground">
                        Conto cash: {operation.cashAssetName || cashAssets.find(asset => asset.id === operation.cashAssetId)?.name || operation.cashAssetId}
                      </p>
                    )}
                    {(operation.fees > 0 || operation.taxes > 0) && (
                      <p className="text-xs text-muted-foreground">
                        Commissioni {formatCurrency(operation.fees)} · Tasse {formatCurrency(operation.taxes)}
                      </p>
                    )}
                    {operation.notes && (
                      <p className="mt-1 text-xs text-muted-foreground">{operation.notes}</p>
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-3 desktop:justify-end">
                    <div className="text-right">
                      <p className={operation.netCashEffect >= 0 ? 'font-semibold text-green-600' : 'font-semibold text-red-600'}>
                        {formatCurrency(operation.netCashEffect)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        PMC risultante {operation.resultingAverageCost ? formatCurrency(operation.resultingAverageCost) : '-'}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handleEdit(operation.id)}
                      disabled={deletingId === operation.id}
                    >
                      Modifica
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(operation.id)}
                      disabled={deletingId === operation.id}
                      title="Elimina operazione"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
