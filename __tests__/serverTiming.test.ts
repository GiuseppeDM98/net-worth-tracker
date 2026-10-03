import { describe, expect, it } from 'vitest';
import { startTiming } from '@/lib/server/serverTiming';

/** A clock that returns the given readings in order, so every duration is known in advance. */
function scriptedClock(...readings: number[]): () => number {
  let index = 0;
  return () => readings[Math.min(index++, readings.length - 1)];
}

/** Parses a Server-Timing value into { name → { dur?, desc? } }, the way DevTools reads it. */
function parseServerTiming(header: string): Record<string, { dur?: number; desc?: string }> {
  const metrics: Record<string, { dur?: number; desc?: string }> = {};
  for (const entry of header.split(',')) {
    const [name, ...params] = entry.trim().split(';');
    const metric: { dur?: number; desc?: string } = {};
    for (const param of params) {
      const [key, raw] = param.split('=');
      const value = raw.startsWith('"') ? raw.slice(1, -1).replace(/\\(.)/g, '$1') : raw;
      if (key === 'dur') metric.dur = Number(value);
      if (key === 'desc') metric.desc = value;
    }
    metrics[name] = metric;
  }
  return metrics;
}

describe('startTiming', () => {
  it('credits each stage with the time since the previous mark and measures total up to the header', () => {
    // start 0 · auth at 3 · db at 45.3 · compute at 57.4 · header at 60
    const timing = startTiming(scriptedClock(0, 3, 45.3, 57.4, 60));

    timing.mark('auth');
    timing.mark('db');
    timing.mark('compute');
    const header = timing.toHeader({ source: 'recompute' });

    expect(header).toBe('auth;dur=3, db;dur=42.3, compute;dur=12.1, total;dur=60, source;desc=recompute');
    expect(parseServerTiming(header)).toEqual({
      auth: { dur: 3 },
      db: { dur: 42.3 },
      compute: { dur: 12.1 },
      total: { dur: 60 },
      source: { desc: 'recompute' },
    });
  });

  it('sums a stage marked twice and keeps it at its first position', () => {
    // start 0 · db 10 · compute 12 · db 30 · header 31
    const timing = startTiming(scriptedClock(0, 10, 12, 30, 31));

    timing.mark('db');
    timing.mark('compute');
    timing.mark('db');

    expect(timing.toHeader()).toBe('db;dur=28, compute;dur=2, total;dur=31');
  });

  it('quotes a description that is not a bare token, so the header stays parseable', () => {
    const timing = startTiming(scriptedClock(0, 1));

    const header = timing.toHeader({ source: 'materialized summary "v20"' });

    expect(header).toBe('total;dur=1, source;desc="materialized summary \\"v20\\""');
    expect(parseServerTiming(header).source.desc).toBe('materialized summary "v20"');
  });

  it('defaults to the real clock', () => {
    const header = startTiming().toHeader();

    expect(header).toMatch(/^total;dur=\d+(\.\d)?$/);
  });
});
