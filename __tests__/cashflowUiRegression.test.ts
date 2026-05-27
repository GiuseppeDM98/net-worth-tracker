import { readFileSync } from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '..');

function readRepoFile(relativePath: string): string {
  return readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

describe('cashflow UI regression guards', () => {
  it('keeps CurrentYearTab chart data hooks outside conditional render branches', () => {
    const source = readRepoFile('components/cashflow/CurrentYearTab.tsx');

    expect(source).not.toMatch(
      /monthFilteredExpenses\.length > 0 && \(\(\) => \{[\s\S]*useMemo/
    );
  });

  it('keeps CurrentYearTab period controls visible when the selected attribution has no current-year records', () => {
    const source = readRepoFile('components/cashflow/CurrentYearTab.tsx');

    expect(source).not.toContain('{currentYearExpenses.length > 0 && (');
    expect(source).toContain('Nessuna transazione trovata per il ${currentYear}');
  });

  it('keeps TotalHistoryTab attribution controls visible when the selected attribution has no records', () => {
    const source = readRepoFile('components/cashflow/TotalHistoryTab.tsx');

    expect(source).not.toMatch(/if \(scopedExpenses\.length === 0\)/);
  });

  it('allows changing the cashflow entry type while editing', () => {
    const source = readRepoFile('components/expenses/ExpenseDialog.tsx');

    expect(source).not.toContain('disabled={!!expense}');
    expect(source).not.toContain('Il tipo di voce non può essere modificato');
  });

  it('keeps cashflow analysis tabs reachable and special operations inside tracking', () => {
    const pageSource = readRepoFile('app/dashboard/cashflow/page.tsx');
    const trackingSource = readRepoFile('components/cashflow/ExpenseTrackingTab.tsx');

    for (const value of ['current-year', 'total-history', 'compensations']) {
      expect(pageSource).toContain(`value: '${value}'`);
      expect(pageSource).toContain(`TabsContent value="${value}"`);
    }

    expect(pageSource).not.toContain("value: 'investments'");
    expect(pageSource).not.toContain("value: 'transfers'");
    expect(trackingSource).toContain("{ value: 'investment', label: 'Investimento' }");
    expect(trackingSource).toContain("{ value: 'transfer', label: 'Trasferimento' }");
  });

  it('keeps the household attribution settings tab reachable from settings navigation', () => {
    const source = readRepoFile('app/dashboard/settings/page.tsx');

    expect(source).toContain("{ value: 'household'");
    expect(source).toContain("label: 'Attribuzioni'");
    expect(source).toContain('TabsContent value="household"');
  });
});
