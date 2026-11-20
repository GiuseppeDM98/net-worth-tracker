'use client';

/**
 * The card of a guided path outside the Consulente (DESIGN.md → The Path-Scene Rule): Compravendita and
 * the plan of accumulation render it, so the reader learns one shape. One 720px tile per screen: the
 * eyebrow «Passo n di N · tema», the question as the headline, one help line, the controls, the footer
 * with «Indietro», «Ricomincia» and one primary button. No rail and no slide — those are the
 * Consulente's, whose wizard imports only the three class constants.
 *
 * «Ricomincia» (owner, 2026-10-21 tour) is armed like a movement's delete (`useArmedDelete`): the first
 * press asks again, so a stray tap never loses the answers.
 */

import { useRef, type ReactNode } from 'react';
import { TILE_EYEBROW_CLASS, TILE_SURFACE_CLASS } from '@/components/ui/tile';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useArmedDelete } from '@/lib/hooks/useArmedDelete';

export const PATH_HEADLINE_CLASS = 'text-[24px] font-semibold leading-[1.15] tracking-[-0.025em] text-foreground desktop:text-[30px]';
export const PATH_HELP_CLASS = 'text-[14px] leading-[1.6] text-muted-foreground desktop:text-[15px]';
/** 44 px to touch below `desktop:`, 36 px from it. */
export const PATH_BUTTON_CLASS = 'h-11 desktop:h-9';

const CARD_CLASS = cn(TILE_SURFACE_CLASS, 'mx-auto w-full max-w-[720px] p-5 desktop:p-6');

export interface PathCardProps {
  /** «Passo n di N · tema» is built here; `index` is zero-based (the screen's place in the path). */
  step: { index: number; total: number; theme: string };
  question: string;
  help: string;
  children: ReactNode;
  back: { onClick: () => void; disabled: boolean };
  /** «Ricomincia», armed like a movement's delete (`useArmedDelete`). */
  restart: { onConfirm: () => void; disabled: boolean };
  /** The line over the primary button: a block (warning) or a failure (destructive). */
  status: { tone: 'warning' | 'failure'; text: string } | null;
  /** `disabled` also while the path writes: the host passes it with the running label. */
  primary: { label: string; onClick: () => void; disabled: boolean };
}

export function PathCard({ step, question, help, children, back, restart, status, primary }: PathCardProps) {
  const restartRef = useRef<HTMLButtonElement | null>(null);
  const { armed: restartArmed, onClick: onRestartClick, onBlur: onRestartBlur } = useArmedDelete(restartRef, restart.onConfirm);
  const position = `Passo ${step.index + 1} di ${step.total}`;

  return (
    <section className={CARD_CLASS} aria-label={`${position}: ${step.theme}`}>
      <h2 className={TILE_EYEBROW_CLASS}>
        {position} · {step.theme}
      </h2>
      <p className={cn(PATH_HEADLINE_CLASS, 'mt-3')}>{question}</p>
      <p className={cn(PATH_HELP_CLASS, 'mt-2 max-w-[600px]')}>{help}</p>

      <div className="mt-5 flex flex-col gap-4">{children}</div>

      <div className="mt-6 flex flex-col-reverse gap-2 border-t border-border pt-4 tablet:flex-row tablet:items-center tablet:justify-between">
        <div className="flex flex-col-reverse gap-2 tablet:flex-row">
          <Button type="button" variant="outline" className={PATH_BUTTON_CLASS} onClick={back.onClick} disabled={back.disabled}>
            Indietro
          </Button>
          <Button
            ref={restartRef}
            type="button"
            variant={restartArmed ? 'destructive' : 'ghost'}
            className={cn(PATH_BUTTON_CLASS, !restartArmed && 'text-muted-foreground')}
            onClick={onRestartClick}
            onBlur={onRestartBlur}
            disabled={restart.disabled}
            aria-pressed={restartArmed}
          >
            {restartArmed ? 'Premi di nuovo per ricominciare' : 'Ricomincia'}
          </Button>
        </div>
        <div className="flex flex-col gap-2 tablet:items-end">
          {status && (
            <p role="status" className={cn('text-[12px]', status.tone === 'failure' ? 'text-destructive' : 'text-warning-foreground')}>
              {status.text}
            </p>
          )}
          <Button type="button" className={PATH_BUTTON_CLASS} disabled={primary.disabled} onClick={primary.onClick}>
            {primary.label}
          </Button>
        </div>
      </div>
    </section>
  );
}

/**
 * The eyebrow is «Fatto»; `ariaLabel` names the section («Operazione registrata», «Piano attivo»);
 * `help` is one line, or several (a second line says what did not land, as the model not updated).
 */
export function PathDoneCard({ ariaLabel, headline, help, children }: { ariaLabel: string; headline: string; help: string | readonly string[]; children: ReactNode }) {
  const lines = typeof help === 'string' ? [help] : help;
  return (
    <section className={CARD_CLASS} aria-label={ariaLabel}>
      <h2 className={TILE_EYEBROW_CLASS}>Fatto</h2>
      <p className={cn(PATH_HEADLINE_CLASS, 'mt-3')} role="status">
        {headline}
      </p>
      {lines.map((line) => (
        <p key={line} className={cn(PATH_HELP_CLASS, 'mt-2')}>
          {line}
        </p>
      ))}
      <div className="mt-6 flex flex-col gap-2 border-t border-border pt-4 tablet:flex-row tablet:justify-end">{children}</div>
    </section>
  );
}
