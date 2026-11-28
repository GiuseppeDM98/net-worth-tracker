/**
 * Which periodic emails are due on an Italian day, and whether one may still be sent.
 *
 * An email is about a CLOSED period and leaves the day after it ends (owner, 2026-11-23: it used to
 * leave on the period's last evening, with the day's rows missing and a note saying so). The cron
 * that sends it runs daily: the first three days of a month are its window, and a ledger of what
 * was sent makes each period go out once.
 */
export type PeriodicEmailKind = 'monthly' | 'yearly';

export interface DueEmail {
  kind: PeriodicEmailKind;
  /** The period's year and its LAST month (12 for a year). */
  year: number;
  month: number;
  /** «2026-10» for a month, «2026» for a year: the period's name in the ledger. */
  periodKey: string;
}

/** The days of a month on which the email of the period just closed may still leave. */
export const EMAIL_CATCH_UP_DAYS = 3;

export function monthPeriodKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

/** The month that ended before the Italian day `todayIso`. */
export function lastClosedMonth(todayIso: string): { year: number; month: number } {
  const [year, month] = todayIso.split('-').map(Number);
  return month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
}

/** The year that ended before the Italian day `todayIso`. */
export function lastClosedYear(todayIso: string): number {
  return Number(todayIso.slice(0, 4)) - 1;
}

/** What may leave today, in sending order: the month just closed and, in January, the year just closed. */
export function emailsDueOn(todayIso: string): DueEmail[] {
  if (Number(todayIso.slice(8, 10)) > EMAIL_CATCH_UP_DAYS) return [];
  const closed = lastClosedMonth(todayIso);
  const due: DueEmail[] = [{ kind: 'monthly', ...closed, periodKey: monthPeriodKey(closed.year, closed.month) }];
  if (closed.month === 12) due.push({ kind: 'yearly', year: closed.year, month: 12, periodKey: String(closed.year) });
  return due;
}

export type EmailDeliveryStatus = 'sending' | 'sent';

/** A claim older than this with no «sent» belongs to a run that died. */
export const EMAIL_CLAIM_STALE_MS = 30 * 60 * 1000;

/** Whether a run may take this (account, kind, period): never sent, and not being sent right now. */
export function canClaimDelivery(existing: { status: EmailDeliveryStatus; claimedAtMs: number } | null, nowMs: number): boolean {
  if (!existing) return true;
  return existing.status === 'sending' && nowMs - existing.claimedAtMs > EMAIL_CLAIM_STALE_MS;
}

export function emailDeliveryId(userId: string, kind: string, periodKey: string): string {
  return `${userId}_${kind}_${periodKey}`;
}
