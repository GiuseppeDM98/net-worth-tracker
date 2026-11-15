/**
 * `SplitQuotaBody` (components/cashflow/tiles/SplitQuotaBody.tsx): the Quota tile's body — with a
 * computed basis the incomes' ring (The Ring Rule, 2026-11-12) beside the person blocks, each name
 * led by its arc's swatch; past six people the ring folds and the sixth block on wears the fold's
 * grey. Figures invented and round. Seen red on 2026-11-15 with the swatch taken as `ring[index].color`
 * instead of `ringSwatchAt`.
 */

import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SplitQuotaBody } from '@/components/cashflow/tiles/SplitQuotaBody';
import { resolveSplitBasis } from '@/lib/utils/expenseSplitSummary';
import { RING_REST_COLOR } from '@/lib/utils/ringChart';
import type { Expense } from '@/types/expenses';
import type { FamilyMember } from '@/types/assets';

const NOW = new Date(2026, 7, 15, 12);

const incomeOf = (member: FamilyMember, amount: number): Expense => ({
  id: `in-${member.id}`,
  userId: 'u1',
  type: 'income',
  categoryId: 'cat-stipendio',
  categoryName: 'Stipendio',
  amount,
  currency: 'EUR',
  date: new Date(2026, 7, 10, 12),
  createdAt: NOW,
  updatedAt: NOW,
  personalMemberId: member.id,
});

const people = (count: number): FamilyMember[] =>
  Array.from({ length: count }, (_, index) => ({ id: `m-${index + 1}`, name: `Persona ${index + 1}` }));

const swatchesOf = (container: HTMLElement) =>
  Array.from(container.querySelectorAll<HTMLElement>('[data-split-person] [aria-hidden="true"].h-2.w-2')).map((swatch) => swatch.style.background);

describe('SplitQuotaBody', () => {
  it('D2: the incomes’ ring and one swatch per person, in settings order', () => {
    const members = people(2);
    const basis = resolveSplitBasis([incomeOf(members[0], 600), incomeOf(members[1], 900)], members);
    const { container } = render(<SplitQuotaBody basis={basis} />);
    expect(screen.getByRole('img', { name: /^Entrate per persona: Persona 1 40%, Persona 2 60%; entrate 1500/ })).toBeTruthy();
    expect(swatchesOf(container)).toEqual(['var(--chart-2)', 'var(--chart-7)']);
  });

  it('D2: seven people fold the ring — the sixth and seventh blocks wear the fold’s grey', () => {
    const members = people(7);
    const basis = resolveSplitBasis(members.map((member, index) => incomeOf(member, 1000 - index * 100)), members);
    const { container } = render(<SplitQuotaBody basis={basis} />);
    const swatches = swatchesOf(container);
    expect(swatches).toHaveLength(7);
    expect(swatches.slice(5)).toEqual([RING_REST_COLOR, RING_REST_COLOR]);
  });

  it('draws nothing without a basis', () => {
    const members = people(2);
    const { container } = render(<SplitQuotaBody basis={resolveSplitBasis([incomeOf(members[0], 600)], members)} />);
    expect(container.innerHTML).toBe('');
  });
});
