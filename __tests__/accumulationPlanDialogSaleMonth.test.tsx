/**
 * The editor's «Vendi a» and a new plan's account (2026-11-19). No test mounts the editor (1.700 lines, six
 * hooks): `SaleMonthSelect` is rendered alone and `emptyDraft` is called directly, both exported for this.
 */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

vi.mock('@/lib/firebase/config', () => ({ auth: { currentUser: null }, db: {} }));
vi.mock('@/lib/services/assetService', () => ({ calculateAssetValue: (a: { quantity: number; currentPrice: number }) => a.quantity * a.currentPrice }));
vi.mock('@/lib/services/assetAllocationService', () => ({ compareAllocations: vi.fn() }));

import { SaleMonthSelect, emptyDraft } from '@/components/allocation/AccumulationPlanDialog';
import { monthLabelLong } from '@/lib/utils/accumulationNarrative';
import type { PlanDisposal } from '@/types/accumulationPlan';

const sale: PlanDisposal = { assetId: 'fondo-y', estimatedProceedsEur: 6000, status: 'planned' };

describe('SaleMonthSelect', () => {
  it('lists the months of a new plan and hands back the chosen index', () => {
    const onChange = vi.fn();
    render(<SaleMonthSelect disposal={sale} firstIndex={1} months={12} firstMonth="2027-01" onChange={onChange} />);
    expect(screen.getByText('Vendi a')).toBeTruthy();
    fireEvent.click(screen.getByRole('combobox', { name: 'Vendi a' }));
    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(12);
    expect(options[11].textContent).toBe(monthLabelLong('2027-12'));
    fireEvent.click(screen.getByRole('option', { name: monthLabelLong('2027-03') }));
    expect(onChange).toHaveBeenCalledWith(3);
  });

  // Mutation that turns it red: `?? 1` restored for a sale without a month.
  it('in a revision a sale without a month reads the first revised one', () => {
    render(<SaleMonthSelect disposal={sale} firstIndex={4} months={9} firstMonth="2027-04" onChange={() => {}} />);
    expect(screen.getByRole('combobox', { name: 'Vendi a' }).textContent).toBe(monthLabelLong('2027-04'));
  });
});

describe('emptyDraft', () => {
  // Mutation that turns it red: the parameter ignored.
  it('starts on the account for the investments, or on none', () => {
    expect(emptyDraft('2027-01', [], [], 0, undefined, 'cash-invest').liquidity.sourceCashAssetIds).toEqual(['cash-invest']);
    expect(emptyDraft('2027-01', [], [], 0, undefined, null).liquidity.sourceCashAssetIds).toEqual([]);
  });
});
