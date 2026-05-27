import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('cashflow unified movement form', () => {
  it('uses one movement entrypoint instead of embedding dedicated special-operation forms', () => {
    const source = readFileSync('components/cashflow/ExpenseTrackingTab.tsx', 'utf8');

    expect(source).toContain('Nuovo movimento');
    expect(source).toContain('UnifiedMovementDialog');
    expect(source).toContain('MOVEMENT_TYPE_CARDS');
    expect(source).not.toContain('<InvestmentOperationsTab embedded />');
    expect(source).not.toContain('<InternalTransfersTab embedded />');
    expect(source).not.toContain("from '@/components/cashflow/InvestmentOperationsTab'");
    expect(source).not.toContain("from '@/components/cashflow/InternalTransfersTab'");
  });

  it('keeps type-specific fields inside the unified movement dialog', () => {
    const source = readFileSync('components/cashflow/ExpenseTrackingTab.tsx', 'utf8');

    expect(source).toContain('movementKind');
    expect(source).toContain('assetId');
    expect(source).toContain('quantity');
    expect(source).toContain('pricePerUnit');
    expect(source).toContain('fromCashAssetId');
    expect(source).toContain('toCashAssetId');
    expect(source).toContain('purpose');
    expect(source).toContain('createInvestmentOperation');
    expect(source).toContain('createInternalTransfer');
  });

  it('unifies edit and delete actions for cashflow, investment, and transfer movements in one list', () => {
    const source = readFileSync('components/cashflow/ExpenseTrackingTab.tsx', 'utf8');

    expect(source).toContain('handleEditMovement');
    expect(source).toContain('handleDeleteMovement');
    expect(source).toContain("kind: 'investment'");
    expect(source).toContain("kind: 'transfer'");
    expect(source).toContain("kind: 'expense'");
    expect(source).not.toContain('Storico operazioni');
    expect(source).not.toContain('Storico trasferimenti');
  });
});
