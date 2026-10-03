/**
 * Server-Timing for a route handler: where a request's time went, readable in the browser's DevTools
 * (Network → the request → Timing → Server Timing) with no tooling, in production too.
 *
 * Why a header and not a log: the latency that matters lives only in production (Vercel functions to
 * Firestore, one round trip per stage), while on the emulator a round trip is ~1 ms. A header puts the
 * measure next to the request that paid it, and `npm run perf:bench` already records it per call.
 *
 * Usage: `startTiming()` at the top of the handler, `mark(name)` at the end of each stage — the time
 * since the previous mark is credited to `name`, and a name marked twice (two database stages) sums —
 * then `toHeader({ source })` builds the value, with `total` measured up to that call.
 * Pure: the clock is injected, the default is `performance.now()`.
 */

export interface ServerTimingRecorder {
  /** Credits the time elapsed since the previous mark (or the start) to `name`. */
  mark(name: string): void;
}

export interface ServerTiming extends ServerTimingRecorder {
  /**
   * The header value: every marked stage in first-mark order, then `total`, then one `desc` entry per
   * description (e.g. `{ source: 'recompute' }` → `source;desc=recompute`).
   */
  toHeader(descriptions?: Record<string, string>): string;
}

// RFC 7230 token characters: a desc made only of these needs no quotes.
const TOKEN_PATTERN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;

function formatDescription(value: string): string {
  if (TOKEN_PATTERN.test(value)) return value;
  return `"${value.replace(/["\\]/g, '\\$&')}"`;
}

function formatDuration(ms: number): string {
  return (Math.round(ms * 10) / 10).toString();
}

export function startTiming(clock: () => number = () => performance.now()): ServerTiming {
  const startedAt = clock();
  let lastMarkAt = startedAt;
  // A Map keeps first-insertion order, so the header lists the stages in the order they ran.
  const durations = new Map<string, number>();

  return {
    mark(name) {
      const now = clock();
      durations.set(name, (durations.get(name) ?? 0) + (now - lastMarkAt));
      lastMarkAt = now;
    },
    toHeader(descriptions = {}) {
      const entries = [...durations].map(([name, ms]) => `${name};dur=${formatDuration(ms)}`);
      entries.push(`total;dur=${formatDuration(clock() - startedAt)}`);
      for (const [name, value] of Object.entries(descriptions)) {
        entries.push(`${name};desc=${formatDescription(value)}`);
      }
      return entries.join(', ');
    },
  };
}
