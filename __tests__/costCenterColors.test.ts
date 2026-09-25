import { describe, it, expect } from 'vitest';
import {
  COST_CENTER_COLOR_KEYS,
  COST_CENTER_COLOR_SLOT_COUNT,
  firstFreeColorKey,
  mapColorSlotUsage,
  resolveCostCenterColorSlot,
  resolveCostCenterColor,
} from '@/lib/utils/costCenterColors';

// A stand-in for what useChartColors() hands back: ten resolved CSS colour strings.
const PALETTE = Array.from({ length: 10 }, (_, i) => `oklch(0.6 0.2 ${i * 36})`);

describe('resolveCostCenterColorSlot', () => {
  it('maps each slot key to its own index', () => {
    COST_CENTER_COLOR_KEYS.forEach((key, i) => {
      expect(resolveCostCenterColorSlot(key, 'any-id')).toBe(i);
    });
  });

  it('maps every legacy hex to the slot at its old position', () => {
    // The pre-token palette, in its original order — a center keeps the identity its
    // owner picked, without a Firestore backfill.
    const legacy = [
      '#3b82f6',
      '#10b981',
      '#f59e0b',
      '#ef4444',
      '#8b5cf6',
      '#ec4899',
      '#06b6d4',
      '#84cc16',
    ];
    legacy.forEach((hex, i) => {
      expect(resolveCostCenterColorSlot(hex, 'any-id')).toBe(i);
    });
  });

  it('accepts a legacy hex in any casing', () => {
    expect(resolveCostCenterColorSlot('#3B82F6', 'any-id')).toBe(0);
  });

  it('falls back to a stable, in-range slot when there is no stored colour', () => {
    for (const stored of [undefined, null, '']) {
      const slot = resolveCostCenterColorSlot(stored, 'center-abc');
      expect(slot).toBeGreaterThanOrEqual(0);
      expect(slot).toBeLessThan(COST_CENTER_COLOR_SLOT_COUNT);
      expect(resolveCostCenterColorSlot(stored, 'center-abc')).toBe(slot);
    }
  });

  it('gives two uncoloured centers different slots rather than collapsing them onto one', () => {
    // The old fallback was a flat `?? var(--chart-1)`, so every uncoloured center was the
    // same colour and the rail stopped distinguishing anything.
    const ids = ['aaa', 'bbb', 'ccc', 'ddd', 'eee', 'fff'];
    const slots = new Set(ids.map((id) => resolveCostCenterColorSlot(undefined, id)));
    expect(slots.size).toBeGreaterThan(1);
  });

  it('does not move the slot when the ranking changes', () => {
    // Deriving the fallback from the row's rank would repaint half the list on every
    // period switch; it is derived from the immutable document id instead.
    const first = resolveCostCenterColorSlot(undefined, 'center-xyz');
    const second = resolveCostCenterColorSlot(undefined, 'center-xyz');
    expect(second).toBe(first);
  });

  it('treats an unrecognised value as uncoloured instead of throwing it away', () => {
    const slot = resolveCostCenterColorSlot('#123456', 'center-abc');
    expect(slot).toBe(resolveCostCenterColorSlot(undefined, 'center-abc'));
  });
});

describe('resolveCostCenterColor', () => {
  it('resolves a slot key against the active palette', () => {
    expect(resolveCostCenterColor('chart-3', 'any-id', PALETTE)).toBe(PALETTE[2]);
  });

  it('resolves a legacy hex through its slot, not as itself', () => {
    // The whole point of the migration: the stored hex never reaches the DOM again.
    const resolved = resolveCostCenterColor('#f59e0b', 'any-id', PALETTE);
    expect(resolved).toBe(PALETTE[2]);
    expect(resolved).not.toBe('#f59e0b');
  });

  it('stays in range when the palette is shorter than the slot count', () => {
    // useChartColors can hand back its static default on the first frame after hydration.
    const short = ['oklch(0.6 0.2 0)', 'oklch(0.6 0.2 36)'];
    const resolved = resolveCostCenterColor('chart-8', 'any-id', short);
    expect(short).toContain(resolved);
  });

  it('falls back to a chart CSS variable rather than undefined on an empty palette', () => {
    expect(resolveCostCenterColor('chart-1', 'any-id', [])).toMatch(/^var\(--chart-[1-5]\)$/);
  });
});

// ─── Who holds which slot ─────────────────────────────────────────────────────

// The owner's account on 2026-09-18: two cars saved with the SAME legacy default hex.
const TWO_CARS = [
  { id: 'jogger', name: 'Dacia Jogger', color: '#3b82f6' },
  { id: 'vacanze', name: 'Vacanze', color: '#f59e0b' },
  { id: 'corsa', name: 'Opel Corsa', color: '#3b82f6' },
];

describe('mapColorSlotUsage', () => {
  it('names every active center on a slot, a legacy hex and a slot key alike', () => {
    const usage = mapColorSlotUsage([...TWO_CARS, { id: 'bici', name: 'Bici', color: 'chart-1' }]);
    expect(usage.get(0)).toEqual(['Dacia Jogger', 'Opel Corsa', 'Bici']);
    expect(usage.get(2)).toEqual(['Vacanze']);
    expect(usage.get(1)).toBeUndefined();
  });

  it('leaves out the center being edited: its own slot is not taken by another', () => {
    expect(mapColorSlotUsage(TWO_CARS, 'corsa').get(0)).toEqual(['Dacia Jogger']);
    expect(mapColorSlotUsage(TWO_CARS, 'vacanze').get(2)).toBeUndefined();
  });

  it('frees the slot of an archived center', () => {
    const usage = mapColorSlotUsage([{ id: 'trasloco', name: 'Trasloco', color: 'chart-2', archivedAt: new Date('2025-01-10') }]);
    expect(usage.size).toBe(0);
  });
});

describe('firstFreeColorKey', () => {
  it('starts a first center on the first slot', () => {
    expect(firstFreeColorKey([])).toBe('chart-1');
  });

  it('never hands a new center a colour an active one already wears', () => {
    // Slots 0 and 2 are taken: the third car would have been a third blue until 2026-09-18.
    expect(firstFreeColorKey(TWO_CARS)).toBe('chart-2');
    expect(firstFreeColorKey([...TWO_CARS, { id: 'casa', name: 'Casa', color: 'chart-2' }])).toBe('chart-4');
  });

  it('reuses the slot of an archived center', () => {
    expect(firstFreeColorKey([{ id: 'a', name: 'A', color: 'chart-1', archivedAt: new Date('2025-01-10') }])).toBe('chart-1');
  });

  it('with all eight taken picks the least crowded slot, the lowest on a tie', () => {
    const full = COST_CENTER_COLOR_KEYS.map((color, i) => ({ id: `c${i}`, name: `C${i}`, color }));
    expect(firstFreeColorKey(full)).toBe('chart-1');
    // A ninth on slot 0 makes it the crowded one: the next free-est is slot 1.
    expect(firstFreeColorKey([...full, { id: 'c8', name: 'C8', color: 'chart-1' }])).toBe('chart-2');
  });
});
