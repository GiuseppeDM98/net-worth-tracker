import { describe, it, expect } from 'vitest';
import {
  describeFailedSections,
  describeFreshness,
  describeLastSuccessfulRead,
  describeReadFailure,
  resolveSurfaceState,
  READ_FAILURE_EYEBROW,
  READ_FAILURE_REASSURANCE,
  RETRY_LABEL,
} from '@/lib/utils/statesNarrative';

/**
 * The words and the one decision behind the three names of an absence
 * (DESIGN.md → The Absence-Has-Three-Names Rule).
 */
describe('resolveSurfaceState', () => {
  it('should report a wait while the query is loading', () => {
    expect(resolveSurfaceState({ loading: true, failed: false })).toBe('loading');
  });

  it('should report a failure once the query has settled on an error', () => {
    expect(resolveSurfaceState({ loading: false, failed: true })).toBe('failed');
  });

  it('should keep a retrying query in the wait, not in the failure', () => {
    // React Query re-enters `isLoading` while it retries: a retry is an attempt, not a verdict.
    expect(resolveSurfaceState({ loading: true, failed: true })).toBe('loading');
  });

  it('should report ready when neither holds', () => {
    expect(resolveSurfaceState({ loading: false, failed: false })).toBe('ready');
  });
});

describe('describeReadFailure', () => {
  it('should name the subject in the eyebrow and keep the severity out of the sentence', () => {
    const notice = describeReadFailure({
      subject: 'Classi',
      consequence: 'La ripartizione per classe non è stata letta.',
    });

    expect(notice.eyebrow).toBe('Classi · lettura fallita');
    expect(notice.message).toBe('La ripartizione per classe non è stata letta.');
  });

  it('should fall back to the bare eyebrow when the failure has no single subject', () => {
    const notice = describeReadFailure({
      consequence: 'Il riepilogo del patrimonio non è stato letto.',
    });

    expect(notice.eyebrow).toBe(READ_FAILURE_EYEBROW);
  });

  it('should always close with what was NOT touched', () => {
    const generic = describeReadFailure({ consequence: 'Il riepilogo non è stato letto.' });
    expect(generic.reassurance).toBe(READ_FAILURE_REASSURANCE);

    const scoped = describeReadFailure({
      consequence: 'I centri di costo non sono stati letti.',
      untouched: 'I centri e le spese registrate non sono stati toccati.',
    });
    expect(scoped.reassurance).toBe(
      'Ricarica la pagina per riprovare. I centri e le spese registrate non sono stati toccati.',
    );
  });

  it('should offer the retry only when the caller can actually retry', () => {
    expect(describeReadFailure({ consequence: 'x' }).retryLabel).toBeNull();
    expect(describeReadFailure({ consequence: 'x', canRetry: true }).retryLabel).toBe(RETRY_LABEL);
  });
});

describe('describeLastSuccessfulRead', () => {
  const now = new Date(2026, 8, 1, 14, 30);

  it('should say the hour when the last good read was today', () => {
    expect(describeLastSuccessfulRead(new Date(2026, 8, 1, 9, 14), now)).toBe(
      'Ultima lettura riuscita: oggi alle 09:14',
    );
  });

  it('should say the day when the last good read was not today', () => {
    expect(describeLastSuccessfulRead(new Date(2026, 7, 31, 22, 5), now)).toBe(
      'Ultima lettura riuscita: 31 agosto alle 22:05',
    );
  });

  it('should drop the clause entirely when there has never been a good read', () => {
    // The Narrative Honesty Rule: a missing input removes its clause, it never pads it.
    expect(describeLastSuccessfulRead(null, now)).toBeNull();
  });
});

describe('describeFreshness', () => {
  // Instants, not local Dates: the reading speaks Italy's clock whatever the machine's zone.
  const now = new Date('2026-09-29T14:30:00.000Z'); // 16:30 in Rome (CEST)

  it('should say the hour alone when the figure was read the same Italian day', () => {
    expect(describeFreshness({ updatedAt: new Date('2026-09-29T07:42:00.000Z'), now })).toBe(
      'Aggiornato alle 09:42, sto rileggendo…',
    );
  });

  it('should say «ieri» for the day before, on the Italian calendar', () => {
    // 23:30 UTC on the 28th is already 01:30 on the 29th in Rome: today, not yesterday.
    expect(describeFreshness({ updatedAt: new Date('2026-09-28T23:30:00.000Z'), now })).toBe(
      'Aggiornato alle 01:30, sto rileggendo…',
    );
    expect(describeFreshness({ updatedAt: new Date('2026-09-28T16:42:00.000Z'), now })).toBe(
      'Aggiornato ieri alle 18:42, sto rileggendo…',
    );
  });

  it('should name the day further back', () => {
    expect(describeFreshness({ updatedAt: new Date('2026-09-27T16:42:00.000Z'), now })).toBe(
      'Aggiornato il 27 settembre alle 18:42, sto rileggendo…',
    );
  });

  it('should find yesterday across a month edge and a DST edge', () => {
    expect(describeFreshness({ updatedAt: new Date('2026-09-30T20:00:00.000Z'), now: new Date('2026-10-01T10:00:00.000Z') })).toBe(
      'Aggiornato ieri alle 22:00, sto rileggendo…',
    );
    // 2026-10-25 is the autumn change in Rome (03:00 CEST → 02:00 CET, 01:00 UTC): 09:00 UTC is
    // already 10:00 CET, and the day after it «ieri» is still the 25th, 23 or 25 hours apart.
    expect(describeFreshness({ updatedAt: new Date('2026-10-25T09:00:00.000Z'), now: new Date('2026-10-26T00:30:00.000Z') })).toBe(
      'Aggiornato ieri alle 10:00, sto rileggendo…',
    );
  });

  it('should say nothing when nothing on screen is old', () => {
    // The Narrative Honesty Rule: no placeholder, the header line simply holds the description.
    expect(describeFreshness({ updatedAt: null, now })).toBeNull();
  });
});

/**
 * The one announcement of a phone's failed reads (`PageRest`'s live node, since 2026-10-10;
 * AGENTS.md § Accessibility). Falsified on
 * 2026-10-10: the two-section case went red with the singular sentence fixed for every count.
 */
describe('describeFailedSections', () => {
  it('should say nothing when nothing failed, so the live node empties', () => {
    expect(describeFailedSections([])).toBeNull();
  });

  it('should name one failed section in the singular', () => {
    expect(describeFailedSections(['Benchmark'])).toBe('Una sezione non è stata letta: Benchmark.');
  });

  it('should count the failed sections and list them in the plural', () => {
    expect(describeFailedSections(['Benchmark', 'Contributi'])).toBe('2 sezioni non sono state lette: Benchmark, Contributi.');
  });
});
