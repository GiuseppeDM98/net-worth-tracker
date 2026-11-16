'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Tile, TILE_CELL_CLASS, TILE_EYEBROW_CLASS } from '@/components/ui/tile';
import { cn } from '@/lib/utils';

/** How a message is read (2026-11-12): what it can be, and how to read it another way. */
const READINGS: ReadonlyArray<{ label: string; description: string }> = [
  { label: 'Domanda', description: 'Una domanda aperta: sui dati di oggi, o sul periodo che nomini' },
  { label: 'Analisi', description: 'Il giudizio su un mese, un anno, da inizio anno o tutto lo storico' },
  { label: 'Movimento', description: "Una spesa, un'entrata o uno spostamento: te lo propongo come riga" },
  { label: 'cambia', description: 'Sotto ogni risposta: rileggo la domanda come scegli tu' },
];

/**
 * «Come funziona», below the grid behind a disclosure — the guide that used to open from a
 * «?» in the header and push the verdict down. Closed by default: the verdict and the tiles
 * already answer the page's question, and the guide is reference, not content. Three tiles,
 * one per non-obvious behaviour (how a message is read, the web search, the memory).
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
            Come leggo i messaggi, la ricerca web e la memoria — su quali numeri rispondo
          </span>
        </span>
        <ChevronDown className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} aria-hidden="true" />
      </CollapsibleTrigger>

      <CollapsibleContent className="pt-1">
        <div className="grid grid-cols-1 gap-3 tablet:grid-cols-2 desktop:grid-cols-12">
          <div className={cn(TILE_CELL_CLASS, 'tablet:col-span-2 desktop:col-span-4')}>
            <Tile
              eyebrow="Come ti leggo"
              reading={[{ text: "Scrivi come parleresti: capisco io se è una domanda, un'analisi o un movimento, e su quale periodo." }]}
            >
              <dl className="mt-3 divide-y divide-border">
                {READINGS.map(({ label, description }) => (
                  <div key={label} className="flex gap-3 py-[9px]">
                    <dt className="w-20 shrink-0 text-[13px] font-medium text-foreground">{label}</dt>
                    <dd className="text-[13px] leading-[1.45] text-muted-foreground">{description}</dd>
                  </div>
                ))}
              </dl>
            </Tile>
          </div>

          <div className={cn(TILE_CELL_CLASS, 'desktop:col-span-4')}>
            <Tile eyebrow="Ricerca web" reading={[{ text: 'Il contesto macro entra nella risposta solo quando serve, o quando lo chiedi.' }]}>
              <p className="mt-3 text-[13px] leading-[1.45] text-muted-foreground">
                Cerco sul web quando la domanda chiede fatti di fuori — mercati, tassi, inflazione, notizie — o quando lo chiedi; nelle
                analisi anche quando è attivo <span className="font-medium text-foreground">Contesto macro</span> delle Preferenze. Mai
                per un movimento da registrare.
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
