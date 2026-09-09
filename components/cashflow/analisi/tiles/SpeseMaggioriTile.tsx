import type { Narrative } from '@/lib/utils/narrative';
import type { TopExpenseRow, TopExpenses } from '@/lib/utils/analisiSummary';
import { Tile } from '@/components/ui/tile';
import { RankedRows, type RankedRow } from '@/components/ui/ranked-rows';

interface SpeseMaggioriTileProps {
  top: TopExpenses;
  reading: Narrative | null;
  /** A row opens the Scheda of its category (or subcategory). */
  onSelect: (row: TopExpenseRow) => void;
  className?: string;
}

/**
 * «Quali sono le spese più grandi?» — the largest single rows of the period as ranked rows:
 * the category, the day and the subcategory as the caption, the amount, its share of the
 * period's spending. Only the top rows are carried, so the aside says «5 di 412».
 */
export function SpeseMaggioriTile({ top, reading, onSelect, className }: SpeseMaggioriTileProps) {
  const byKey = new Map(top.rows.map((row) => [row.key, row]));
  const rows: RankedRow[] = top.rows.map((row) => ({ key: row.key, label: row.label, caption: row.caption, amount: row.amount, percentage: row.percentage }));

  return (
    <Tile
      eyebrow="Spese maggiori"
      aside={
        top.count > 0 ? (
          <span>
            <span className="font-mono tabular-nums">{top.rows.length}</span> di <span className="font-mono tabular-nums">{top.count}</span>
          </span>
        ) : undefined
      }
      reading={reading}
      className={className}
    >
      {rows.length === 0 ? (
        <p className="mt-3 text-[13px] text-muted-foreground">Nessuna spesa registrata nel periodo.</p>
      ) : (
        <div className="mt-2 flex flex-1 flex-col">
          <RankedRows
            rows={rows}
            color="var(--chart-1)"
            labelClassName="w-[46%] min-w-[120px]"
            ariaLabel="Spese maggiori del periodo"
            onRowClick={(row) => {
              const source = byKey.get(row.key);
              if (source) onSelect(source);
            }}
          />
          <p className="mt-auto border-t border-border pt-3.5 text-[11px] text-muted-foreground">Quota sulle spese del periodo; una riga apre la scheda della voce.</p>
        </div>
      )}
    </Tile>
  );
}
