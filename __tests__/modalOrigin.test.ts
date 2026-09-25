import { describe, it, expect } from 'vitest';
import { resolveCenteredModalOrigin } from '@/lib/utils/modalOrigin';

describe('resolveCenteredModalOrigin — a centred dialog grows from its trigger', () => {
  it('points at the centre of the trigger, in the dialog’s own box, without measuring the dialog', () => {
    // «Crea snapshot» at 1440: top right of the header.
    expect(resolveCenteredModalOrigin({ left: 1267, top: 28, width: 146, height: 36 })).toBe('calc(50% + 1340px - 50vw) calc(50% + 46px - 50vh)');
  });

  it('is the dialog’s own centre for a trigger at the centre of the viewport', () => {
    // 50% + 720px − 50vw is 50% on a 1440px viewport: the default origin, so no drift at all.
    expect(resolveCenteredModalOrigin({ left: 700, top: 440, width: 40, height: 20 })).toBe('calc(50% + 720px - 50vw) calc(50% + 450px - 50vh)');
  });

  it('keeps sub-pixel noise out of the style string', () => {
    expect(resolveCenteredModalOrigin({ left: 10.123456, top: 20.98765, width: 145.66, height: 36 })).toBe('calc(50% + 83px - 50vw) calc(50% + 39px - 50vh)');
  });
});
