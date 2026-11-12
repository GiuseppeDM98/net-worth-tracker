'use client';

/**
 * ModelEditDialog — «Modifica a mano» of the model portfolio. One row
 * per instrument with its market weight; the save is blocked until the weights add up to 100 (±0,01),
 * and «Riporta a 100%» rescales them proportionally. A candidate (an instrument to evaluate, held at
 * 0 shares) can be taken out of the model here, which never deletes the asset (RM3). Saves with
 * `origin: 'manual'`; the optimizer snapshot stays — it documents the starting point, as in the PAC.
 */
import { runGuarded } from '@/lib/utils/runGuarded';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import type { Asset } from '@/types/assets';
import type { ModelPortfolio, ModelPortfolioWeight } from '@/types/modelPortfolio';
import { calculateAssetValue } from '@/lib/services/assetService';
import { useSaveModelPortfolio } from '@/lib/hooks/useModelPortfolio';
import { clearHeldCandidates, groupMembers, MODEL_WEIGHT_SUM_TOLERANCE, seedModelFromToday } from '@/lib/utils/modelPortfolio';
import { describeWriteError } from '@/lib/utils/dialogNarrative';
import { formatPercentageIt } from '@/lib/utils/formatters';
import {
  describeModelGroupMembers,
  MODEL_CANDIDATE_TAG,
  MODEL_COL_INSTRUMENT,
  MODEL_COL_MODEL,
  MODEL_EDIT_ACTION_CANCEL,
  MODEL_EDIT_ACTION_NORMALIZE,
  MODEL_EDIT_ACTION_REMOVE,
  MODEL_EDIT_ACTION_SAVE,
  MODEL_EDIT_READING,
  MODEL_EDIT_SUM_LABEL,
  MODEL_EDIT_TITLE,
  MODEL_SAVED_TOAST,
  MODEL_TILE_EYEBROW,
} from '@/lib/utils/weightOptimizerNarrative';
import { ResponsiveModal } from '@/components/ui/responsive-modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface ModelEditDialogProps {
  open: boolean;
  onClose: () => void;
  ownerId: string;
  /** `null` = no model saved yet: the rows start from today's market weights (PO1, RO3). */
  model: ModelPortfolio | null;
  allAssets: Asset[];
  labelOf: (assetId: string) => string;
}

function parseWeight(text: string): number {
  const value = Number(text.replace(',', '.'));
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

export function ModelEditDialog({ open, onClose, ownerId, model, allAssets, labelOf }: ModelEditDialogProps) {
  const saveModel = useSaveModelPortfolio(ownerId);
  const [rows, setRows] = useState<Array<{ assetId: string; memberAssetIds?: string[]; text: string; candidate: boolean }>>(() =>
    (model?.weights ?? seedModelFromToday(allAssets, calculateAssetValue)).map((weight) => ({
      assetId: weight.assetId,
      ...(weight.memberAssetIds ? { memberAssetIds: weight.memberAssetIds } : {}),
      text: String(weight.targetPercentage).replace('.', ','),
      candidate: !!weight.candidate,
    })),
  );

  const total = useMemo(() => rows.reduce((sum, row) => sum + parseWeight(row.text), 0), [rows]);
  const balanced = Math.abs(total - 100) <= MODEL_WEIGHT_SUM_TOLERANCE;

  const normalize = () => {
    if (total <= 0) return;
    // Hundredths of a point, the remainder on the largest weight — the same rule as `toModelWeights`.
    const cents = rows.map((row) => Math.round((parseWeight(row.text) / total) * 10000));
    const remainder = 10000 - cents.reduce((sum, c) => sum + c, 0);
    let largest = 0;
    for (let i = 1; i < cents.length; i++) if (cents[i] > cents[largest]) largest = i;
    cents[largest] += remainder;
    setRows((current) => current.map((row, i) => ({ ...row, text: String(cents[i] / 100).replace('.', ',') })));
  };

  const handleSave = async () => {
    const assetsById = new Map(allAssets.map((asset) => [asset.id, asset]));
    const weights: ModelPortfolioWeight[] = rows.map((row) => ({
      assetId: row.assetId,
      ...(row.memberAssetIds ? { memberAssetIds: row.memberAssetIds } : {}),
      targetPercentage: parseWeight(row.text),
      ...(row.candidate ? { candidate: true } : {}),
    }));
    await runGuarded(
      async () => {
        await saveModel.mutateAsync({
          input: {
            weights: clearHeldCandidates(weights, assetsById, (asset) => asset.quantity),
            origin: 'manual',
            optimizerSnapshot: model?.optimizerSnapshot,
          },
          allAssets,
        });
        toast.success(MODEL_SAVED_TOAST);
        onClose();
      },
      (error) => {
        toast.error(describeWriteError(error));
      },
    );
  };

  return (
    <ResponsiveModal
      open={open}
      onClose={onClose}
      width="lg"
      eyebrow={MODEL_TILE_EYEBROW}
      title={MODEL_EDIT_TITLE}
      reading={MODEL_EDIT_READING}
      footer={
        <>
          <Button variant="outline" className="h-11 text-[12px] desktop:h-8" onClick={onClose} disabled={saveModel.isPending}>
            {MODEL_EDIT_ACTION_CANCEL}
          </Button>
          <Button variant="outline" className="h-11 text-[12px] desktop:h-8" onClick={normalize} disabled={total <= 0 || balanced}>
            {MODEL_EDIT_ACTION_NORMALIZE}
          </Button>
          <Button className="h-11 text-[12px] desktop:h-8" onClick={() => void handleSave()} disabled={!balanced || saveModel.isPending}>
            {MODEL_EDIT_ACTION_SAVE}
          </Button>
        </>
      }
    >
      <table className="w-full text-[13px]">
        <thead>
          <tr className="border-b border-border text-left">
            <th scope="col" className="py-1.5 pr-2 text-[9px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              {MODEL_COL_INSTRUMENT}
            </th>
            <th scope="col" className="py-1.5 pr-0 text-right text-[9px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              {MODEL_COL_MODEL} (%)
            </th>
            <th scope="col" className="w-0 py-1.5" />
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            const members = groupMembers(row);
            const held = members.some((id) => {
              const member = allAssets.find((a) => a.id === id);
              return member ? calculateAssetValue(member) > 0 : false;
            });
            return (
              <tr key={row.assetId} className="border-b border-border last:border-0">
                <th scope="row" className="py-1.5 pr-2 text-left font-normal text-foreground">
                  {labelOf(row.assetId)}
                  {members.length > 1 && (
                    <span className="block text-[11px] text-muted-foreground">
                      {describeModelGroupMembers(members.filter((id) => id !== row.assetId).map(labelOf))}
                    </span>
                  )}
                  {row.candidate && !held && <span className="ml-1.5 text-[11px] text-muted-foreground">{MODEL_CANDIDATE_TAG}</span>}
                </th>
                <td className="py-1 pr-0 text-right">
                  <Input
                    type="text"
                    inputMode="decimal"
                    aria-label={`Peso di ${labelOf(row.assetId)} (%)`}
                    className="ml-auto h-11 w-24 text-right font-mono tabular-nums desktop:h-8"
                    value={row.text}
                    onChange={(event) => setRows((current) => current.map((r, i) => (i === index ? { ...r, text: event.target.value } : r)))}
                  />
                </td>
                <td className="py-1 pl-2 text-right">
                  {row.candidate && !held && (
                    <Button
                      variant="ghost"
                      className="h-11 text-[12px] desktop:h-8"
                      onClick={() => setRows((current) => current.filter((_, i) => i !== index))}
                    >
                      {MODEL_EDIT_ACTION_REMOVE}
                    </Button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className={`mt-3 text-[13px] ${balanced ? 'text-muted-foreground' : 'text-warning-foreground'}`}>
        {MODEL_EDIT_SUM_LABEL}: <span className="font-mono tabular-nums">{formatPercentageIt(total, 2)}</span>
      </p>
    </ResponsiveModal>
  );
}
