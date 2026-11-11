/**
 * The ```expense-proposal protocol's pure layer: the schema, where the blocks are in a message,
 * the proposal read against the page's lists, and what the card shows under the row.
 *
 * Every figure and name is invented. The suite runs in Europe/Rome, the machine's zone and UTC:
 * `form.date` is the browser's local midnight of the proposal's day, and it must be that Italian
 * day in each of them.
 */
import { describe, expect, it } from 'vitest';
import {
  EXPENSE_PROPOSALS_MAX_PER_MESSAGE,
  PROPOSAL_INTERRUPTED_LINE,
  PROPOSAL_NO_ACCOUNT_LABEL,
  describeExpenseProposalState,
  expenseProposalSchema,
  listFencedBlocks,
  parseExpenseProposal,
  proposalKey,
  resolveExpenseProposal,
  stripFencedBlocks,
  type ExpenseProposal,
  type ExpenseProposalRefs,
} from '@/lib/utils/expenseProposal';
import { getItalyDateIso } from '@/lib/utils/dateHelpers';
import type { Asset } from '@/types/assets';
import type { CostCenter } from '@/types/costCenters';
import type { ExpenseCategory } from '@/types/expenses';

const NOW = new Date('2026-11-01T10:00:00Z'); // domenica 1 novembre 2026, in Italy

function category(id: string, name: string, type: ExpenseCategory['type'], subs: [string, string][] = []): ExpenseCategory {
  return {
    id, userId: 'u1', name, type,
    subCategories: subs.map(([subId, subName]) => ({ id: subId, name: subName })),
    createdAt: NOW, updatedAt: NOW,
  } as ExpenseCategory;
}

function account(id: string, name: string): Asset {
  return { id, userId: 'u1', name, type: 'cash', assetClass: 'cash', quantity: 1000, currentPrice: 1, currency: 'EUR' } as Asset;
}

function refs(overrides: Partial<ExpenseProposalRefs> = {}): ExpenseProposalRefs {
  return {
    categories: [
      category('cat-cibo', 'Cibo', 'variable', [['sub-spesa', 'Spesa']]),
      category('cat-salute', 'Salute', 'fixed', [['sub-farmacia', 'Farmacia']]),
      category('cat-stipendio', 'Stipendio', 'income'),
      category('cat-mutuo', 'Mutuo', 'debt'),
    ],
    cashAssets: [account('acc-main', 'Conto principale'), account('acc-save', 'Conto risparmio')],
    properties: [],
    costCenters: [
      { id: 'cc-auto', userId: 'u1', name: 'Automobile' } as CostCenter,
      { id: 'cc-old', userId: 'u1', name: 'Vecchia casa', archivedAt: NOW } as CostCenter,
    ],
    members: [{ id: 'm-anna', name: 'Anna' }],
    defaults: { debitId: 'acc-main', creditId: 'acc-save' },
    loans: [],
    feeCategory: null,
    settings: { costCentersEnabled: true, expenseSplitEnabled: true },
    ...overrides,
  };
}

function proposal(overrides: Partial<ExpenseProposal> = {}): ExpenseProposal {
  return {
    kind: 'expense', type: 'variable', amount: 103, dateIso: '2026-11-01',
    categoryId: 'cat-cibo', subCategoryId: 'sub-spesa', reason: 'Come le ultime spese al supermercato.',
    ...overrides,
  };
}

const fence = (language: string, body = '{}') => `\`\`\`${language}\n${body}\n\`\`\``;

describe('expenseProposalSchema', () => {
  it('accepts a complete proposal', () => {
    expect(expenseProposalSchema.safeParse(proposal()).success).toBe(true);
  });

  it('bounds the amount: positive, at most one million', () => {
    expect(expenseProposalSchema.safeParse(proposal({ amount: 0 })).success).toBe(false);
    expect(expenseProposalSchema.safeParse(proposal({ amount: -5 })).success).toBe(false);
    expect(expenseProposalSchema.safeParse(proposal({ amount: 1_000_000 })).success).toBe(true);
    expect(expenseProposalSchema.safeParse(proposal({ amount: 1_000_000.01 })).success).toBe(false);
  });

  it('bounds the note at 200 characters and the reason at 240, and requires a reason', () => {
    expect(expenseProposalSchema.safeParse(proposal({ note: 'n'.repeat(200) })).success).toBe(true);
    expect(expenseProposalSchema.safeParse(proposal({ note: 'n'.repeat(201) })).success).toBe(false);
    expect(expenseProposalSchema.safeParse(proposal({ reason: 'r'.repeat(241) })).success).toBe(false);
    expect(expenseProposalSchema.safeParse(proposal({ reason: '' })).success).toBe(false);
  });

  it('refuses a kind and a type that disagree', () => {
    expect(expenseProposalSchema.safeParse(proposal({ kind: 'income', type: 'variable' })).success).toBe(false);
    expect(expenseProposalSchema.safeParse(proposal({ kind: 'expense', type: 'income' })).success).toBe(false);
    expect(expenseProposalSchema.safeParse(proposal({ kind: 'income', type: 'income' })).success).toBe(true);
  });

  it('refuses a debt or transfer type', () => {
    expect(expenseProposalSchema.safeParse({ ...proposal(), type: 'debt' }).success).toBe(false);
    expect(expenseProposalSchema.safeParse({ ...proposal(), type: 'transfer' }).success).toBe(false);
  });

  it('wants a real calendar date', () => {
    expect(expenseProposalSchema.safeParse(proposal({ dateIso: '2026-02-28' })).success).toBe(true);
    expect(expenseProposalSchema.safeParse(proposal({ dateIso: '2026-02-31' })).success).toBe(false);
    expect(expenseProposalSchema.safeParse(proposal({ dateIso: '2026-13-01' })).success).toBe(false);
    expect(expenseProposalSchema.safeParse(proposal({ dateIso: '1/11/2026' })).success).toBe(false);
  });
});

describe('parseExpenseProposal', () => {
  it('parses a valid block', () => {
    expect(parseExpenseProposal(JSON.stringify(proposal()))?.amount).toBe(103);
  });

  it('returns null for malformed JSON — an amount written with a comma', () => {
    expect(parseExpenseProposal('{ "kind": "expense", "amount": 103,50 }')).toBeNull();
  });

  it('returns null for a missing field', () => {
    expect(parseExpenseProposal(JSON.stringify({ ...proposal(), reason: undefined }))).toBeNull();
  });
});

describe('listFencedBlocks', () => {
  it('ranks each block among the blocks of its own language', () => {
    const content = [
      'Ecco le righe.',
      ...Array.from({ length: 5 }, () => fence('expense-proposal')),
      fence('goal-proposal'),
    ].join('\n\n');
    const blocks = listFencedBlocks(content);
    expect(blocks.map((block) => proposalKey(block.language === 'goal-proposal' ? 'goal' : 'expense', block.index))).toEqual([
      'expense:0', 'expense:1', 'expense:2', 'expense:3', 'expense:4', 'goal:0',
    ]);
    expect(EXPENSE_PROPOSALS_MAX_PER_MESSAGE).toBe(5);
  });

  it('gives the offset of the fence, past its indentation', () => {
    const content = `Riga.\n\n  ${fence('expense-proposal').replace(/\n/g, '\n  ')}`;
    const [block] = listFencedBlocks(content);
    expect(content.slice(block.offset, block.offset + 3)).toBe('```');
    expect(block.index).toBe(0);
  });

  it('does not list a fence that follows a quote or a list marker, and keeps the next key', () => {
    const content = `> \`\`\`expense-proposal\n> {}\n> \`\`\`\n\n- \`\`\`expense-proposal\n\n${fence('expense-proposal')}`;
    const blocks = listFencedBlocks(content);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].index).toBe(0);
  });

  it('treats a fence line inside an open block as content', () => {
    const content = '````text\n```expense-proposal\n{}\n```\n````\n\n' + fence('expense-proposal');
    const blocks = listFencedBlocks(content);
    expect(blocks.map((block) => block.language)).toEqual(['text', 'expense-proposal']);
    expect(blocks[1].index).toBe(0);
  });

  it('closes an unterminated block at the end of the content', () => {
    expect(listFencedBlocks('```expense-proposal\n{}')).toEqual([{ language: 'expense-proposal', offset: 0, index: 0 }]);
  });

  it('reads tildes as fences too', () => {
    expect(listFencedBlocks('~~~goal-proposal\n{}\n~~~')[0].language).toBe('goal-proposal');
  });
});

describe('stripFencedBlocks', () => {
  it('keeps the prose and drops the blocks', () => {
    expect(stripFencedBlocks(`Ti propongo questa riga.\n\n${fence('expense-proposal')}\n\nVa bene?`)).toBe('Ti propongo questa riga.\n\n\n\nVa bene?');
  });

  it('is empty for a message that is only a block', () => {
    expect(stripFencedBlocks(fence('expense-proposal'))).toBe('');
  });
});

describe('resolveExpenseProposal', () => {
  it('resolves a spending row on the debit default, dated today', () => {
    const resolved = resolveExpenseProposal(proposal({ amount: 103.004 }), refs(), NOW);
    expect(resolved.problems).toEqual([]);
    expect(resolved.dropped).toEqual([]);
    expect(resolved.form).toMatchObject({
      type: 'variable', amount: 103, currency: 'EUR', categoryId: 'cat-cibo', subCategoryId: 'sub-spesa', linkedCashAssetId: 'acc-main',
    });
    expect(resolved.labels).toMatchObject({
      kind: 'Spesa', category: 'Cibo › Spesa', categoryName: 'Cibo', subCategoryName: 'Spesa', date: 'oggi', account: 'Conto principale',
    });
    expect(resolved.labels.settlement).toBeUndefined();
  });

  it('dates the row on the proposal’s Italian day, in every zone', () => {
    for (const dateIso of ['2026-11-01', '2026-10-25', '2026-03-29', '2027-01-01']) {
      const resolved = resolveExpenseProposal(proposal({ dateIso }), refs(), NOW);
      expect(getItalyDateIso(resolved.form.date)).toBe(dateIso);
    }
  });

  it('labels yesterday and any other day', () => {
    expect(resolveExpenseProposal(proposal({ dateIso: '2026-10-31' }), refs(), NOW).labels.date).toBe('ieri');
    expect(resolveExpenseProposal(proposal({ dateIso: '2026-10-15' }), refs(), NOW).labels.date).toBe('15/10/2026');
  });

  it('says when a future row will move its account', () => {
    const resolved = resolveExpenseProposal(proposal({ dateIso: '2026-11-02' }), refs(), NOW);
    expect(resolved.labels.date).toBe('02/11/2026');
    expect(resolved.labels.settlement).toBe('si applica al saldo il 02/11/2026');
    expect(resolved.problems).toEqual([]);
  });

  it('gives an income the credit default', () => {
    const resolved = resolveExpenseProposal(
      proposal({ kind: 'income', type: 'income', categoryId: 'cat-stipendio', subCategoryId: undefined, amount: 2000 }),
      refs(),
      NOW,
    );
    expect(resolved.form.linkedCashAssetId).toBe('acc-save');
    expect(resolved.labels.kind).toBe('Entrata');
    expect(resolved.labels.account).toBe('Conto risparmio');
  });

  it('takes the account the proposal names over the default', () => {
    expect(resolveExpenseProposal(proposal({ accountId: 'acc-save' }), refs(), NOW).form.linkedCashAssetId).toBe('acc-save');
  });

  it('writes a row with no account when there is neither a named one nor a default', () => {
    const resolved = resolveExpenseProposal(proposal(), refs({ defaults: { debitId: null, creditId: null } }), NOW);
    expect(resolved.form.linkedCashAssetId).toBeUndefined();
    expect(resolved.labels.account).toBe(PROPOSAL_NO_ACCOUNT_LABEL);
    expect(resolved.problems).toEqual([]);
  });

  it('reports an unknown category and leaves the form without one', () => {
    const resolved = resolveExpenseProposal(proposal({ categoryId: 'cat-nope' }), refs(), NOW);
    expect(resolved.problems).toHaveLength(1);
    expect(resolved.form.categoryId).toBeUndefined();
  });

  it('reports a category whose type is not the proposal’s', () => {
    const resolved = resolveExpenseProposal(proposal({ categoryId: 'cat-salute', subCategoryId: undefined }), refs(), NOW);
    expect(resolved.problems[0]).toContain('Spese Necessarie');
    expect(resolved.form.categoryId).toBeUndefined();
  });

  it('reports a debt category: this mode does not propose one', () => {
    const resolved = resolveExpenseProposal(proposal({ categoryId: 'cat-mutuo', subCategoryId: undefined }), refs(), NOW);
    expect(resolved.problems).toHaveLength(1);
  });

  it('reports a subcategory the category does not have', () => {
    const resolved = resolveExpenseProposal(proposal({ subCategoryId: 'sub-farmacia' }), refs(), NOW);
    expect(resolved.problems).toHaveLength(1);
    expect(resolved.form.subCategoryId).toBeUndefined();
    expect(resolved.form.categoryId).toBe('cat-cibo');
  });

  it('reports an account that is not a cash account', () => {
    const resolved = resolveExpenseProposal(proposal({ accountId: 'etf-1' }), refs(), NOW);
    expect(resolved.problems).toHaveLength(1);
    expect(resolved.form.linkedCashAssetId).toBeUndefined();
  });

  it('resolves a centre and a member, and reports the ones it does not find', () => {
    const ok = resolveExpenseProposal(proposal({ costCenterId: 'cc-auto', memberId: 'm-anna' }), refs(), NOW);
    expect(ok.form).toMatchObject({ costCenterId: 'cc-auto', costCenterName: 'Automobile', personalMemberId: 'm-anna' });
    expect(ok.labels).toMatchObject({ costCenter: 'Automobile', member: 'Anna' });

    expect(resolveExpenseProposal(proposal({ costCenterId: 'cc-old' }), refs(), NOW).problems).toHaveLength(1);
    expect(resolveExpenseProposal(proposal({ costCenterId: 'cc-nope' }), refs(), NOW).problems).toHaveLength(1);
    expect(resolveExpenseProposal(proposal({ memberId: 'm-nope' }), refs(), NOW).problems).toHaveLength(1);
  });

  it('drops a centre with the centres off and a member with Divisione off', () => {
    const resolved = resolveExpenseProposal(
      proposal({ costCenterId: 'cc-auto', memberId: 'm-anna' }),
      refs({ settings: { costCentersEnabled: false, expenseSplitEnabled: false } }),
      NOW,
    );
    expect(resolved.problems).toEqual([]);
    expect(resolved.dropped).toHaveLength(2);
    expect(resolved.dropped.every((line) => line.startsWith('ignorato: '))).toBe(true);
    expect(resolved.form.costCenterId).toBeUndefined();
    expect(resolved.form.personalMemberId).toBeUndefined();
  });

  it('keeps «fuori budget» on a spending row and drops it on an income', () => {
    const spending = resolveExpenseProposal(proposal({ excludeFromBudget: true }), refs(), NOW);
    expect(spending.form.excludeFromBudget).toBe(true);
    expect(spending.labels.budget).toBe('fuori budget');

    const income = resolveExpenseProposal(
      proposal({ kind: 'income', type: 'income', categoryId: 'cat-stipendio', subCategoryId: undefined, excludeFromBudget: true }),
      refs(),
      NOW,
    );
    expect(income.form.excludeFromBudget).toBeUndefined();
    expect(income.dropped).toHaveLength(1);
  });

  it('carries the note into the form', () => {
    expect(resolveExpenseProposal(proposal({ note: 'Supermercato' }), refs(), NOW).form.notes).toBe('Supermercato');
  });
});

describe('describeExpenseProposalState', () => {
  const resolved = resolveExpenseProposal(proposal(), refs(), NOW);
  const local = { messageId: 'msg-1', saving: false, readFailed: false, isDemo: false };

  it('offers the three buttons on an idle, writable proposal', () => {
    expect(describeExpenseProposalState(resolved, undefined, local)).toEqual({
      status: 'idle', line: null, canConfirm: true, canEdit: true, canIgnore: true,
    });
  });

  it('shows the outcome and no button once written or ignored', () => {
    const at = NOW;
    expect(describeExpenseProposalState(resolved, { status: 'written', writtenIds: ['e1'], at }, local)).toEqual({
      status: 'written', line: 'Registrata', canConfirm: false, canEdit: false, canIgnore: false,
    });
    expect(describeExpenseProposalState(resolved, { status: 'ignored', at }, local)).toMatchObject({
      status: 'ignored', line: 'Ignorata', canConfirm: false,
    });
  });

  it('offers nothing on a message that never received its server id', () => {
    expect(describeExpenseProposalState(resolved, undefined, { ...local, messageId: 'local-assistant-1' })).toEqual({
      status: 'interrupted', line: PROPOSAL_INTERRUPTED_LINE, canConfirm: false, canEdit: false, canIgnore: false,
    });
  });

  it('closes every button while the write is in flight', () => {
    expect(describeExpenseProposalState(resolved, undefined, { ...local, saving: true })).toMatchObject({
      status: 'saving', canConfirm: false, canEdit: false, canIgnore: false,
    });
  });

  it('cannot confirm a proposal with a problem, but can still edit or ignore it', () => {
    const broken = resolveExpenseProposal(proposal({ categoryId: 'cat-nope' }), refs(), NOW);
    expect(describeExpenseProposalState(broken, undefined, local)).toMatchObject({ canConfirm: false, canEdit: true, canIgnore: true });
  });

  it('writes nothing on failed reads or in the demo', () => {
    expect(describeExpenseProposalState(resolved, undefined, { ...local, readFailed: true })).toMatchObject({ canConfirm: false, canEdit: false, canIgnore: true });
    expect(describeExpenseProposalState(resolved, undefined, { ...local, isDemo: true })).toMatchObject({ canConfirm: false, canEdit: false });
  });
});
