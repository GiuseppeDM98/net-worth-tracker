import { describe, it, expect } from 'vitest';
import {
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
