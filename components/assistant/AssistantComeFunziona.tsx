'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Tile, TILE_CELL_CLASS, TILE_EYEBROW_CLASS } from '@/components/ui/tile';
import { cn } from '@/lib/utils';

/** The five periods and what each one hands the model. */
const PERIODS: ReadonlyArray<{ label: string; description: string }> = [
  { label: 'Mese', description: 'Patrimonio netto, cashflow, dividendi e allocazione del mese selezionato.' },
  { label: 'Anno', description: 'Andamento annuale, risparmio, crescita degli investimenti e dividendi totali.' },
  { label: 'YTD', description: "Le stesse metriche dall'1 gennaio a oggi, per l'andamento in corso d'anno." },
  { label: 'Storico', description: 'Evoluzione completa del patrimonio da quando hai iniziato a tracciare.' },
  { label: 'Libera', description: 'Una domanda aperta, con o senza un periodo numerico collegato.' },
];

/**
 * «Come funziona», below the grid behind a disclosure — the guide that used to open from a
 * «?» in the header and push the verdict down. Closed by default: the verdict and the tiles
 * already answer the page's question, and the guide is reference, not content. Three tiles,
 * one per non-obvious behaviour (the periods, the web search, the memory).
 */
export function AssistantComeFunziona() {
  const [open, setOpen] = useState(false);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger
        className="flex w-full items-center justify-between gap-3 border-t border-border/40 py-3 text-left"
        aria-label="Come funziona"
      >
        <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className={TILE_EYEBROW_CLASS}>Come funziona</span>
          <span className="text-[13px] text-muted-foreground">
            I cinque periodi, la ricerca web nel contesto macro e la memoria — come l&apos;assistente sceglie i numeri su cui risponde
          </span>
        </span>
        <ChevronDown className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} aria-hidden="true" />
      </CollapsibleTrigger>

      <CollapsibleContent className="pt-1">
        <div className="grid grid-cols-1 gap-3 tablet:grid-cols-2 desktop:grid-cols-12">
          <div className={cn(TILE_CELL_CLASS, 'tablet:col-span-2 desktop:col-span-4')}>
            <Tile eyebrow="Periodi di analisi" reading={[{ text: 'Un periodo per domanda: il verdetto e le tessere leggono lo stesso.' }]}>
              <dl className="mt-3 divide-y divide-border">
                {PERIODS.map(({ label, description }) => (
                  <div key={label} className="flex gap-3 py-[9px]">
                    <dt className="w-14 shrink-0 text-[13px] font-medium text-foreground">{label}</dt>
                    <dd className="text-[13px] leading-[1.45] text-muted-foreground">{description}</dd>
                  </div>
                ))}
              </dl>
            </Tile>
          </div>

          <div className={cn(TILE_CELL_CLASS, 'desktop:col-span-4')}>
            <Tile eyebrow="Ricerca web" reading={[{ text: 'Il contesto macro entra nella risposta solo quando serve, o quando lo chiedi.' }]}>
              <p className="mt-3 text-[13px] leading-[1.45] text-muted-foreground">
                Nelle analisi di periodo il toggle <span className="font-medium text-foreground">Contesto macro</span> delle Preferenze
                abilita sempre la ricerca web. In modalità Libera, se il toggle è attivo la ricerca è sempre abilitata; se è disattivo si
                attiva solo su parole chiave macro — inflazione, tassi, dazi, BCE, recessione — o su frasi come{' '}
                <span className="font-medium text-foreground">«cerca sul web»</span>.
              </p>
            </Tile>
          </div>

          <div className={cn(TILE_CELL_CLASS, 'desktop:col-span-4')}>
            <Tile eyebrow="Memoria" reading={[{ text: 'Quello che dichiari resta, e guida le risposte successive.' }]}>
              <p className="mt-3 text-[13px] leading-[1.45] text-muted-foreground">
                Dopo ogni risposta l&apos;assistente estrae i fatti stabili che hai dichiarato — obiettivi, preferenze di rischio, orizzonti
                temporali — e li salva nel pannello <span className="font-medium text-foreground">Memoria</span>. Un obiettivo con un
                importo e una scadenza viene verificato ogni giorno sui numeri del mese in corso; quando risulta raggiunto, la pagina te lo
                propone come completato.
              </p>
            </Tile>
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
