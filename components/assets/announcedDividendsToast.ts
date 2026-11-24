import { toast } from 'sonner';
import { describeAnnouncedDividendsOutcome, type AnnouncedDividendsOutcome } from '@/lib/utils/announcedDividendsOutcome';

/**
 * The one sentence a trade's answer may carry about the announced dividends it rewrote or removed
 * (2026-11-23); nothing touched, no toast. A function of its own so a caller can invoke it inside a
 * try block: the React Compiler does not lower a conditional there.
 */
export function toastAnnouncedDividends(outcome: AnnouncedDividendsOutcome | undefined): void {
  if (!outcome) return;
  const sentence = describeAnnouncedDividendsOutcome(outcome);
  if (sentence) toast.info(sentence);
}
