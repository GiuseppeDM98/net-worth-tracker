'use client';

/**
 * What «cambia» opens (2026-11-12): how the last message was read, as three questions — what it
 * is, on which period, with the web or not — and «Rileggi», which sends the same prompt again as a
 * new turn with the chosen route. The answer before stays: history is never rewritten.
 *
 * The draft comes from the reading (`routeToChooserDraft`) and goes back as a route
 * (`chooserDraftToOverride`, null for an analysis without a period: «Rileggi» off). The month and
 * the year pickers take the draft's own value even when it is older than their options — the
 * router reads any month from 2000-01, the options go three and four years back.
 */
import { useState } from 'react';
import { AssistantMonthPicker } from '@/components/assistant/AssistantMonthPicker';
import { Button } from '@/components/ui/button';
import { ChoiceList, type ChoiceListOption } from '@/components/ui/choice-list';
import { Label } from '@/components/ui/label';
import { ResponsiveModal } from '@/components/ui/responsive-modal';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { AI_CONTROL_ACCENT_CLASS } from '@/lib/constants/aiAccent';
import { buildMonthOptions, buildYearOptions } from '@/lib/utils/assistantPeriodOptions';
import { chooserDraftToOverride, routeToChooserDraft, type RouteChooserDraft, type RouteChooserKind } from '@/lib/utils/assistantRoute';
import type { AssistantRouteOverride, AssistantRoutePeriod, AssistantRouteReading } from '@/types/assistant';
import { COSTUME_FRAME_RADIUS_CLASS } from '@/lib/constants/themeCostume';
import { cn } from '@/lib/utils';

type PeriodKind = AssistantRoutePeriod['kind'];

const KINDS: ChoiceListOption<RouteChooserKind>[] = [
  { value: 'question', label: 'Una domanda', hint: 'Rispondo a quello che chiedi' },
  { value: 'analysis', label: "Un'analisi", hint: 'Il giudizio su tutto il periodo' },
  { value: 'register', label: 'Un movimento da registrare', hint: 'Te lo propongo come riga: la scrivi tu con Conferma' },
];

const PERIODS: ChoiceListOption<PeriodKind>[] = [
  { value: 'none', label: 'Oggi', hint: 'Il patrimonio di oggi, senza un periodo' },
  { value: 'month', label: 'Un mese' },
  { value: 'year', label: 'Un anno' },
  { value: 'ytd', label: 'Da inizio anno' },
  { value: 'history', label: 'Tutto lo storico' },
];
const ANALYSIS_PERIODS = PERIODS.filter((option) => option.value !== 'none');

interface AssistantRouteChooserProps {
  open: boolean;
  reading: AssistantRouteReading | null;
  today: { year: number; month: number };
  onReread: (route: AssistantRouteOverride) => void;
  onClose: () => void;
  /** The «cambia» that opened it: «Annulla» and Esc bring the focus back there. */
  returnFocusTo: React.RefObject<HTMLElement | null>;
}

export function AssistantRouteChooser({ open, reading, today, onReread, onClose, returnFocusTo }: AssistantRouteChooserProps) {
  // The page keeps the reading while the modal closes, so the body never empties mid-animation.
  return reading ? (
    <ChooserModal open={open} reading={reading} today={today} onReread={onReread} onClose={onClose} returnFocusTo={returnFocusTo} />
  ) : null;
}

function ChooserModal({ open, reading, today, onReread, onClose, returnFocusTo }: AssistantRouteChooserProps & { reading: AssistantRouteReading }) {
  const [draft, setDraft] = useState<RouteChooserDraft>(() => routeToChooserDraft(reading.route, today));
  // Every opening starts from the reading, never from the draft a previous «Annulla» left.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setDraft(routeToChooserDraft(reading.route, today));
  }
  const route = chooserDraftToOverride(draft);

  const baseMonths = buildMonthOptions();
  const monthOptions = baseMonths.some((m) => m.year === draft.month.year && m.month === draft.month.month)
    ? baseMonths : [...baseMonths, draft.month];
  const baseYears = buildYearOptions();
  const yearOptions = baseYears.includes(draft.year) ? baseYears : [...baseYears, draft.year];

  const changeKind = (kind: RouteChooserKind) =>
    // An analysis has no «Oggi»: the period moves to «Un mese».
    setDraft((current) => ({ ...current, kind, period: kind === 'analysis' && current.period === 'none' ? 'month' : current.period }));

  return (
    <ResponsiveModal
      open={open}
      onClose={onClose}
      width="sm"
      eyebrow="Assistente · Lettura"
      title="Come devo leggerla?"
      reading="La rileggo come scegli qui: la risposta nuova arriva sotto, quella di prima resta."
      returnFocusTo={returnFocusTo}
      footer={
        <>
          <Button type="button" variant="outline" onClick={onClose}>Annulla</Button>
          <Button type="button" className={AI_CONTROL_ACCENT_CLASS} disabled={route === null} onClick={() => route && onReread(route)}>
            Rileggi
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <ChoiceList name="route-kind" label="Cosa mi chiedi" mode="single" options={KINDS} value={draft.kind} onChange={changeKind} />

        {draft.kind !== 'register' && (
          <>
            <div className="space-y-3">
              <ChoiceList
                name="route-period"
                label="Su quale periodo"
                mode="single"
                options={draft.kind === 'analysis' ? ANALYSIS_PERIODS : PERIODS}
                value={draft.period}
                onChange={(period) => setDraft((current) => ({ ...current, period }))}
              />
              {draft.period === 'month' && (
                <AssistantMonthPicker value={draft.month} options={monthOptions} onChange={(month) => setDraft((current) => ({ ...current, month }))} />
              )}
              {draft.period === 'year' && (
                <Select value={String(draft.year)} onValueChange={(raw) => setDraft((current) => ({ ...current, year: Number(raw) }))}>
                  <SelectTrigger className="w-full" aria-label="Anno di riferimento">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {yearOptions.map((year) => (
                      <SelectItem key={year} value={String(year)}>{year}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <div className={cn('flex items-center justify-between gap-4 border border-border px-4 py-3', COSTUME_FRAME_RADIUS_CLASS)}>
              <Label htmlFor="route-web" className="flex flex-col items-start gap-0.5">
                <span className="text-[14px] font-medium text-foreground">Cerca anche sul web</span>
                <span className="text-[13px] font-normal text-muted-foreground">Per mercati, tassi e notizie</span>
              </Label>
              <Switch
                id="route-web"
                aria-label="Cerca anche sul web"
                checked={draft.webSearch}
                onCheckedChange={(webSearch) => setDraft((current) => ({ ...current, webSearch }))}
              />
            </div>
          </>
        )}
      </div>
    </ResponsiveModal>
  );
}
