'use client';

import { ErrorNotice } from '@/components/ui/error-notice';
import { Tile } from '@/components/ui/tile';
import { describeRegisterContext, describeRegisterFacts } from '@/lib/utils/assistantNarrative';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { describeReadFailure } from '@/lib/utils/statesNarrative';
import type { AssistantRegisterSummary } from '@/types/assistant';

interface RegistraContestoTileProps {
  /** The browser's summary before the first message, the server's (with the rows it read) after it; null while the reads are out. */
  summary: AssistantRegisterSummary | null;
  /** A read of the categories, the accounts, the settings or the centres failed. */
  readFailed: boolean;
}

const ROLE_LABELS: Record<'addebito' | 'accredito', string> = {
  addebito: 'addebito predefinito',
  accredito: 'accredito predefinito',
};

/**
 * «Cosa conosce l'Assistente» — the companion of the Registra mode (2026-11): the cash accounts
 * a proposed row can move, with today's balance and the two defaults, then the categories'
 * count, the optional features on or off and, once the server has answered, how many recent rows
 * it read. Computed by code from the hooks the page already loaded, so it is on screen before
 * any message and takes NO AI accent: nothing here was written by the model.
 */
export function RegistraContestoTile({ summary, readFailed }: RegistraContestoTileProps) {
  if (readFailed) {
    return (
      <ErrorNotice
        compact
        notice={describeReadFailure({
          subject: "Cosa conosce l'Assistente",
          consequence: 'Categorie e conti non sono stati letti: una riga proposta non si può confermare.',
          untouched: 'Nessuna riga è stata scritta.',
        })}
      />
    );
  }

  return (
    <Tile eyebrow="Cosa conosce l'Assistente" reading={describeRegisterContext(summary)}>
      {summary && summary.accounts.length > 0 && (
        <ul className="mt-3 divide-y divide-border" aria-label="Conti">
          {summary.accounts.map((account) => (
            <li key={account.id} className="flex items-baseline justify-between gap-3 py-[9px]">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] text-foreground" title={account.name}>
                  {account.name}
                </span>
                {account.roles.length > 0 && (
                  <span className="block text-[11px] text-muted-foreground">
                    {account.roles.map((role) => ROLE_LABELS[role]).join(' · ')}
                  </span>
                )}
              </span>
              <span className="shrink-0 font-mono text-[13px] tabular-nums text-foreground">
                {cachedFormatCurrencyEUR(account.balance)}
              </span>
            </li>
          ))}
        </ul>
      )}

      {summary && (
        <ul className="mt-3.5 space-y-1 border-t border-border pt-3.5 text-[11px] text-muted-foreground" aria-label="Cosa legge">
          {describeRegisterFacts(summary).map((fact) => (
            <li key={fact}>{fact}</li>
          ))}
        </ul>
      )}
    </Tile>
  );
}
