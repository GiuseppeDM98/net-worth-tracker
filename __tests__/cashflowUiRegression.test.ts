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
});
