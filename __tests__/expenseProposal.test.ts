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
  PROPOSAL_UNLINKED_INSTALMENT_LABEL,
  PROPOSAL_WAITS_FOR_ANSWER_LINE,
  describeExpenseProposalState,
  expenseProposalSchema,
  listFencedBlocks,
  listNestedFencedBlocks,
  parseExpenseProposal,
  proposalKey,
  resolveExpenseProposal,
  stripFencedBlocks,
  type ExpenseProposal,
  type ExpenseProposalRefs,
} from '@/lib/utils/expenseProposal';
import { getItalyDateIso } from '@/lib/utils/dateHelpers';
import { describePropertyTransferRefusal, EXPENSE_FEE_NEEDS_CATEGORY } from '@/lib/utils/dialogNarrative';
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

  it('refuses a debt or transfer type on a spending row', () => {
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

  it('lists apart the blocks of ONE language behind a quote or a list marker, ranked after the top-level ones', () => {
    const content = `> \`\`\`goal-proposal\n> {}\n> \`\`\`\n\n1. \`\`\`goal-proposal\n   {}\n   \`\`\`\n\n> \`\`\`expense-proposal\n> {}\n> \`\`\`\n\n${fence('goal-proposal')}`;
    const nested = listNestedFencedBlocks(content, 'goal-proposal');
    expect(nested.map((block) => block.index)).toEqual([1, 2]);
    for (const block of nested) expect(content.slice(block.offset, block.offset + 16)).toBe('```goal-proposal');
    // Another language's quoted block is not its business, and the top-level list is unchanged.
    expect(listFencedBlocks(content).map((block) => `${block.language}:${block.index}`)).toEqual(['goal-proposal:0']);
    // A fence-looking line INSIDE a top-level block is content, quoted or not.
    expect(listNestedFencedBlocks('```text\n> ```goal-proposal\n> {}\n```', 'goal-proposal')).toEqual([]);
  });

  it('treats a fence line inside an open block as content', () => {
    const content = '````text\n```expense-proposal\n{}\n```\n````\n\n' + fence('expense-proposal');
    const blocks = listFencedBlocks(content);
    expect(blocks.map((block) => block.language)).toEqual(['text', 'expense-proposal']);
    expect(blocks[1].index).toBe(0);
  });

  it('closes an unterminated block at the end of the content', () => {
    expect(listFencedBlocks('```expense-proposal\n{}')).toEqual([{ language: 'expense-proposal', offset: 0, index: 0, bodyStart: 20, bodyEnd: 22 }]);
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

  it('gives a future row with NO account no settlement line: no balance will move', () => {
    const none = resolveExpenseProposal(proposal({ dateIso: '2027-01-15' }), refs({ defaults: { debitId: null, creditId: null } }), NOW);
    expect(none.labels.account).toBe(PROPOSAL_NO_ACCOUNT_LABEL);
    expect(none.labels.settlement).toBeUndefined();
    // The same row with the default account says when it moves it.
    expect(resolveExpenseProposal(proposal({ dateIso: '2027-01-15' }), refs(), NOW).labels.settlement).toBe('si applica al saldo il 15/01/2027');
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
    expect(resolved.problems).toEqual(['categoria di un altro tipo: Salute']);
    expect(resolved.form.categoryId).toBeUndefined();
  });

  it('reports a debt category on a spending row', () => {
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
  const local = { messageId: 'msg-1', saving: false, readFailed: false, isDemo: false, hasQuestionBlock: false };

  it('offers the three buttons on an idle, writable proposal', () => {
    expect(describeExpenseProposalState(resolved, undefined, local)).toEqual({
      status: 'idle', line: null, feeLine: null, waitLine: null, canConfirm: true, canEdit: true, canIgnore: true,
    });
  });

  it('shows the outcome and no button once written or ignored', () => {
    const at = NOW;
    expect(describeExpenseProposalState(resolved, { status: 'written', writtenIds: ['e1'], at }, local)).toEqual({
      status: 'written', line: 'Registrata', feeLine: null, waitLine: null, canConfirm: false, canEdit: false, canIgnore: false,
    });
    expect(describeExpenseProposalState(resolved, { status: 'ignored', at }, local)).toMatchObject({
      status: 'ignored', line: 'Ignorata', canConfirm: false,
    });
  });

  it('offers nothing on a message that never received its server id', () => {
    expect(describeExpenseProposalState(resolved, undefined, { ...local, messageId: 'local-assistant-1' })).toEqual({
      status: 'interrupted', line: PROPOSAL_INTERRUPTED_LINE, feeLine: null, waitLine: null, canConfirm: false, canEdit: false, canIgnore: false,
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

// ── The four kinds (2026-11) ──

function property(id: string, name: string, value: number): Asset {
  return { id, userId: 'u1', name, type: 'realestate', assetClass: 'realestate', quantity: value, currentPrice: 1, currency: 'EUR' } as Asset;
}

function loan(id: string, name: string, debt: number, rate?: number): Asset {
  return { id, userId: 'u1', name, type: 'loan', assetClass: 'cash', quantity: debt, currentPrice: 1, currency: 'EUR', ...(rate === undefined ? {} : { debtInterestRate: rate }) } as Asset;
}

const FEE_CATEGORY = { categoryId: 'cat-banca', categoryName: 'Banca', type: 'fixed' as const };

function transfer(overrides: Partial<ExpenseProposal> = {}): ExpenseProposal {
  return proposal({ kind: 'transfer', type: 'transfer', categoryId: undefined, subCategoryId: undefined, fromAccount: 'acc-main', toAccount: 'acc-save', amount: 500, ...overrides });
}

function instalment(overrides: Partial<ExpenseProposal> = {}): ExpenseProposal {
  return proposal({ kind: 'debt', type: 'debt', categoryId: 'cat-mutuo', subCategoryId: undefined, amount: 12.34, ...overrides });
}

describe('expenseProposalSchema — the four kinds', () => {
  const parses = (p: Partial<ExpenseProposal> & Record<string, unknown>) => expenseProposalSchema.safeParse(p).success;

  it('accepts exactly the five kind × type pairs', () => {
    const kinds = ['expense', 'income', 'transfer', 'debt'] as const;
    const types = ['fixed', 'variable', 'income', 'transfer', 'debt'] as const;
    const passing: string[] = [];
    for (const kind of kinds) {
      for (const type of types) {
        // Every other field valid for the kind: the pair alone decides.
        const base = kind === 'transfer' ? transfer() : kind === 'debt' ? instalment() : proposal();
        if (parses({ ...base, kind, type })) passing.push(`${kind}:${type}`);
      }
    }
    expect(passing).toEqual(['expense:fixed', 'expense:variable', 'income:income', 'transfer:transfer', 'debt:debt']);
  });

  it('refuses the fields of one kind on another', () => {
    expect(parses({ ...transfer(), toAccount: undefined })).toBe(false);
    expect(parses({ ...transfer(), accountId: 'acc-main' })).toBe(false);
    expect(parses({ ...proposal(), fromAccount: 'acc-main' })).toBe(false);
    expect(parses({ ...proposal(), loanName: 'Mutuo' })).toBe(false);
    expect(parses({ ...instalment(), payoff: true })).toBe(false);
    expect(parses({ ...instalment(), loanName: 'Mutuo', payoff: true })).toBe(true);
  });

  it('lets a spending row and an instalment recur, within the caps, never an income, a transfer or a payoff', () => {
    expect(parses({ ...proposal({ kind: 'income', type: 'income', categoryId: 'cat-stipendio', subCategoryId: undefined }), recurring: { frequency: 'monthly', count: 12 } })).toBe(false);
    expect(parses({ ...transfer(), recurring: { frequency: 'monthly', count: 12 } })).toBe(false);
    expect(parses({ ...instalment({ loanName: 'Mutuo', payoff: true }), recurring: { frequency: 'monthly', count: 12 } })).toBe(false);
    expect(parses({ ...proposal(), recurring: { frequency: 'monthly', count: 360 } })).toBe(true);
    expect(parses({ ...proposal(), recurring: { frequency: 'monthly', count: 361 } })).toBe(false);
    expect(parses({ ...proposal(), recurring: { frequency: 'yearly', count: 40 } })).toBe(true);
    expect(parses({ ...proposal(), recurring: { frequency: 'yearly', count: 41 } })).toBe(false);
    // A series of instalments is the dialog's: `canTypeRecur('debt')`.
    expect(parses({ ...instalment(), recurring: { frequency: 'monthly', count: 12 } })).toBe(true);
  });

  it('accepts an instalment with no loan', () => {
    expect(parses(instalment())).toBe(true);
  });

  it('keeps a new category alone, of the row type, and a new subcategory under the row category', () => {
    expect(parses({ ...proposal({ categoryId: undefined, subCategoryId: undefined }), newCategory: { name: 'Hobby', type: 'variable' } })).toBe(true);
    expect(parses({ ...proposal(), newCategory: { name: 'Hobby', type: 'variable' } })).toBe(false);
    expect(parses({ ...proposal({ categoryId: undefined, subCategoryId: undefined }), newCategory: { name: 'Hobby', type: 'fixed' } })).toBe(false);
    expect(parses({ ...proposal({ subCategoryId: undefined }), newSubCategory: { categoryId: 'cat-cibo', name: 'Mercato' } })).toBe(true);
    expect(parses({ ...proposal({ subCategoryId: undefined }), newSubCategory: { categoryId: 'cat-salute', name: 'Mercato' } })).toBe(false);
    // A row with neither a category nor a new one has nothing to file it under — but a transfer does not need one.
    expect(parses({ ...proposal({ categoryId: undefined, subCategoryId: undefined }) })).toBe(false);
    expect(parses(transfer())).toBe(true);
  });
});

describe('resolveExpenseProposal — transfers', () => {
  const twoAccounts = { cashAssets: [account('acc-a', 'Conto A'), account('acc-b', 'Conto B'), account('acc-ar', 'Conto Arancio'), account('acc-citta', 'Conto Città')] };

  it('resolves an end by id and by name, the first stage with hits deciding', () => {
    const byId = resolveExpenseProposal(transfer({ fromAccount: 'acc-a', toAccount: 'acc-b' }), refs(twoAccounts), NOW);
    expect(byId.form).toMatchObject({ linkedCashAssetId: 'acc-a', transferCashAssetId: 'acc-b' });
    expect(byId.labels.accounts).toBe('Conto A → Conto B');
    expect(byId.problems).toEqual([]);
    // «conto a» is exactly «Conto A»: the startsWith stage («Conto Arancio») is never reached.
    expect(resolveExpenseProposal(transfer({ fromAccount: 'conto a', toAccount: 'acc-b' }), refs(twoAccounts), NOW).form.linkedCashAssetId).toBe('acc-a');
    // Accents and spaces do not matter.
    expect(resolveExpenseProposal(transfer({ fromAccount: '  conto   citta ', toAccount: 'acc-b' }), refs(twoAccounts), NOW).form.linkedCashAssetId).toBe('acc-citta');
  });

  it('calls a name that matches two accounts ambiguous, and one that matches none unknown', () => {
    const ambiguous = resolveExpenseProposal(transfer({ fromAccount: 'conto', toAccount: 'acc-b' }), refs(twoAccounts), NOW);
    expect(ambiguous.problems).toEqual(['ambiguo: Conto A, Conto B, Conto Arancio, Conto Città']);
    expect(ambiguous.form.linkedCashAssetId).toBeUndefined();
    expect(resolveExpenseProposal(transfer({ fromAccount: 'ornitorinco', toAccount: 'acc-b' }), refs(twoAccounts), NOW).problems).toEqual(['conto sconosciuto: ornitorinco']);
  });

  it('refuses one account on both ends', () => {
    expect(resolveExpenseProposal(transfer({ fromAccount: 'acc-main', toAccount: 'Conto principale' }), refs(), NOW).problems).toEqual(['origine e destinazione sono lo stesso conto']);
  });

  it('lands on a property, and says what its value does', () => {
    const resolved = resolveExpenseProposal(transfer({ toAccount: 'casa', amount: 10000 }), refs({ properties: [property('prop-casa', 'Casa al mare', 150000)] }), NOW);
    expect(resolved.problems).toEqual([]);
    expect(resolved.form.transferCashAssetId).toBe('prop-casa');
    expect(resolved.labels.property?.replace(/\s/g, ' ')).toBe("verso l'immobile Casa al mare: il valore della casa sale di 10.000,00 €");
  });

  it('leaves a property within its value, in the dialog’s words', () => {
    const house = property('prop-casa', 'Casa al mare', 800);
    const ok = resolveExpenseProposal(transfer({ fromAccount: 'prop-casa', toAccount: 'acc-main', amount: 800 }), refs({ properties: [house] }), NOW);
    expect(ok.problems).toEqual([]);
    expect(ok.labels.property?.replace(/\s/g, ' ')).toBe("dall'immobile Casa al mare: il valore della casa scende di 800,00 €");
    const over = resolveExpenseProposal(transfer({ fromAccount: 'prop-casa', toAccount: 'acc-main', amount: 900 }), refs({ properties: [house] }), NOW);
    expect(over.problems).toEqual([describePropertyTransferRefusal('Casa al mare', 800)]);
  });

  it('refuses a property on both ends', () => {
    const resolved = resolveExpenseProposal(
      transfer({ fromAccount: 'prop-a', toAccount: 'prop-b', amount: 10 }),
      refs({ properties: [property('prop-a', 'Casa A', 1000), property('prop-b', 'Casa B', 1000)] }),
      NOW,
    );
    expect(resolved.problems).toEqual(['un trasferimento tocca un immobile su un lato solo']);
  });

  it('files a transfer under the category named, else the first transfer one, else a new «Trasferimenti»', () => {
    const transferCategories = [...refs().categories, category('cat-giro', 'Giroconti', 'transfer'), category('cat-trasf', 'Trasferimenti', 'transfer')];
    const named = resolveExpenseProposal(transfer({ categoryId: 'cat-trasf' }), refs({ categories: transferCategories }), NOW);
    expect([named.form.categoryId, named.create]).toEqual(['cat-trasf', null]);
    const first = resolveExpenseProposal(transfer(), refs({ categories: transferCategories }), NOW);
    expect(first.form.categoryId).toBe('cat-giro');
    const fresh = resolveExpenseProposal(transfer(), refs(), NOW);
    expect(fresh.form.categoryId).toBeUndefined();
    expect(fresh.create).toEqual({ transferCategory: true });
    expect(fresh.labels).toMatchObject({ category: 'Trasferimenti (nuova)', categoryName: 'Trasferimenti' });
    expect(fresh.problems).toEqual([]);
    expect(resolveExpenseProposal(transfer({ categoryId: 'cat-cibo' }), refs({ categories: transferCategories }), NOW).problems).toEqual(['categoria di un altro tipo: Cibo']);
  });

  it('drops a member from a transfer', () => {
    const resolved = resolveExpenseProposal(transfer({ memberId: 'm-anna' }), refs(), NOW);
    expect(resolved.form.personalMemberId).toBeUndefined();
    expect(resolved.dropped).toEqual(['ignorato: intestatario']);
  });
});

describe('resolveExpenseProposal — instalments', () => {
  const loans = { loans: [loan('loan-casa', 'Mutuo casa', 1000, 1.2), loan('loan-auto', 'Mutuo auto', 5000, 3)] };

  it('splits a linked instalment as the dialog does', () => {
    const resolved = resolveExpenseProposal(instalment({ loanName: 'loan-casa' }), refs(loans), NOW);
    expect(resolved.problems).toEqual([]);
    expect(resolved.form.debtAssetId).toBe('loan-casa');
    expect(resolved.form.linkedCashAssetId).toBe('acc-main');
    const line = resolved.labels.debt?.replace(/\s/g, ' ');
    expect(line).toContain('11,34 €');
    expect(line).toContain('1,00 €');
  });

  it('prints a payoff as the dialog does', () => {
    const resolved = resolveExpenseProposal(instalment({ loanName: 'mutuo casa', payoff: true, amount: 300 }), refs(loans), NOW);
    expect(resolved.form.isDebtPayoff).toBe(true);
    expect(resolved.labels.debt).toContain('Estinzione parziale');
    // All of it is principal: the debt goes from 1000 to 700, not to 701 (an instalment's split).
    expect(resolved.labels.debt?.replace(/\s/g, ' ')).toContain('scende di 300,00 €, da 1000,00 € a 700,00 €');
  });

  it('calls a name that fits two loans ambiguous, one that fits none unknown', () => {
    expect(resolveExpenseProposal(instalment({ loanName: 'mutuo' }), refs(loans), NOW).problems).toEqual(['prestito ambiguo: Mutuo casa, Mutuo auto']);
    expect(resolveExpenseProposal(instalment({ loanName: 'ornitorinco' }), refs(loans), NOW).problems).toEqual(['prestito sconosciuto: ornitorinco']);
  });

  it('writes an instalment with no loan as an unlinked one', () => {
    const resolved = resolveExpenseProposal(instalment(), refs(loans), NOW);
    expect(resolved.problems).toEqual([]);
    expect(resolved.form.debtAssetId).toBeUndefined();
    expect(resolved.labels.debt).toBe(PROPOSAL_UNLINKED_INSTALMENT_LABEL);
  });

  it('keeps «fuori budget» on an instalment', () => {
    expect(resolveExpenseProposal(instalment({ excludeFromBudget: true }), refs(loans), NOW).form.excludeFromBudget).toBe(true);
  });
});

describe('resolveExpenseProposal — the fee', () => {
  it('carries the fee with Impostazioni’s category and the dialog’s note', () => {
    const onTransfer = resolveExpenseProposal(transfer({ fee: { amount: 1.5 } }), refs({ feeCategory: FEE_CATEGORY }), NOW);
    expect(onTransfer.fee).toEqual({ amount: 1.5, category: FEE_CATEGORY, notes: 'Commissione sul trasferimento a Conto risparmio' });
    const onSpending = resolveExpenseProposal(proposal({ fee: { amount: 2 }, note: 'Bonifico idraulico' }), refs({ feeCategory: FEE_CATEGORY }), NOW);
    expect(onSpending.fee?.notes).toBe('Commissione su Bonifico idraulico');
    expect(resolveExpenseProposal(proposal({ fee: { amount: 2 } }), refs({ feeCategory: FEE_CATEGORY }), NOW).fee?.notes).toBe('Commissione su Cibo');
  });

  it('refuses a fee with no fee category, in the dialog’s sentence', () => {
    const resolved = resolveExpenseProposal(proposal({ fee: { amount: 2 } }), refs(), NOW);
    expect(resolved.problems).toEqual([EXPENSE_FEE_NEEDS_CATEGORY]);
    expect(resolved.fee).toBeNull();
  });

  it('drops the fee of a transfer out of a property', () => {
    const resolved = resolveExpenseProposal(
      transfer({ fromAccount: 'prop-casa', toAccount: 'acc-main', amount: 100, fee: { amount: 2 } }),
      refs({ properties: [property('prop-casa', 'Casa al mare', 1000)], feeCategory: FEE_CATEGORY }),
      NOW,
    );
    expect(resolved.fee).toBeNull();
    expect(resolved.dropped).toEqual(['ignorato: commissione']);
  });

  it('drops «fuori budget» on a transfer, and the member and «fuori budget» names are the dialog’s', () => {
    expect(resolveExpenseProposal(transfer({ excludeFromBudget: true }), refs(), NOW).dropped).toEqual(['ignorato: fuori budget']);
    expect(resolveExpenseProposal(proposal({ memberId: 'm-anna' }), refs({ settings: { costCentersEnabled: true, expenseSplitEnabled: false } }), NOW).dropped).toEqual(['ignorato: intestatario']);
  });
});

describe('resolveExpenseProposal — a series', () => {
  it('starts in the date’s month, on the day asked, clamped', () => {
    const fifth = resolveExpenseProposal(proposal({ dateIso: '2026-11-20', recurring: { frequency: 'monthly', count: 12, day: 5 } }), refs(), NOW);
    expect(fifth.labels.series).toBe('12 occorrenze mensili, dal 05/11/2026 al 05/10/2027');
    expect(fifth.form).toMatchObject({ isRecurring: true, recurringFrequency: 'monthly', recurringCount: 12, recurringDay: 5 });
    expect(resolveExpenseProposal(proposal({ dateIso: '2026-11-20', recurring: { frequency: 'monthly', count: 3, day: 31 } }), refs(), NOW).labels.series).toBe('3 occorrenze mensili, dal 30/11/2026 al 31/01/2027');
    const yearly = resolveExpenseProposal(proposal({ dateIso: '2026-11-20', recurring: { frequency: 'yearly', count: 2 } }), refs(), NOW);
    expect(yearly.labels.series).toBe('2 occorrenze annuali, dal 20/11/2026 al 20/11/2027');
    expect(yearly.form.recurringDay).toBe(20);
  });
});

describe('resolveExpenseProposal — new categories', () => {
  it('reuses a subcategory of that name, else proposes it', () => {
    const reused = resolveExpenseProposal(proposal({ subCategoryId: undefined, newSubCategory: { categoryId: 'cat-cibo', name: '  spesa ' } }), refs(), NOW);
    expect([reused.form.subCategoryId, reused.create]).toEqual(['sub-spesa', null]);
    const fresh = resolveExpenseProposal(proposal({ subCategoryId: undefined, newSubCategory: { categoryId: 'cat-cibo', name: 'Mercato' } }), refs(), NOW);
    expect(fresh.create).toEqual({ subCategory: { categoryId: 'cat-cibo', name: 'Mercato' } });
    expect(fresh.labels).toMatchObject({ category: 'Nuova sottocategoria: Cibo › Mercato', subCategoryName: 'Mercato' });
    expect(fresh.problems).toEqual([]);
  });

  it('reuses a category whose import key matches, else proposes it', () => {
    const base = proposal({ categoryId: undefined, subCategoryId: undefined });
    const reused = resolveExpenseProposal({ ...base, newCategory: { name: 'cibo', type: 'variable' } }, refs(), NOW);
    expect([reused.form.categoryId, reused.create]).toEqual(['cat-cibo', null]);
    const fresh = resolveExpenseProposal({ ...base, newCategory: { name: 'Hobby', type: 'variable' } }, refs(), NOW);
    expect(fresh.create).toEqual({ category: { name: 'Hobby', type: 'variable' } });
    expect(fresh.labels.category).toBe('Nuova categoria: Hobby (Spese Non Necessarie)');
    expect(fresh.problems).toEqual([]);
  });

  it('says so when the account has no category at all — never the failed read', () => {
    expect(resolveExpenseProposal(proposal(), refs({ categories: [] }), NOW).problems).toEqual(['nessuna categoria configurata']);
  });
});

describe('describeExpenseProposalState — the newer outcomes', () => {
  const local = { messageId: 'msg-1', saving: false, readFailed: false, isDemo: false, hasQuestionBlock: false };

  it('waits for the answer when the message also asks', () => {
    const resolved = resolveExpenseProposal(proposal(), refs(), NOW);
    expect(describeExpenseProposalState(resolved, undefined, { ...local, hasQuestionBlock: true })).toMatchObject({
      canConfirm: false, canEdit: true, canIgnore: true, waitLine: PROPOSAL_WAITS_FOR_ANSWER_LINE,
    });
  });

  it('counts a series and its fees from the ids written', () => {
    const series = resolveExpenseProposal(proposal({ recurring: { frequency: 'monthly', count: 12 }, fee: { amount: 1 } }), refs({ feeCategory: FEE_CATEGORY }), NOW);
    const ids = Array.from({ length: 24 }, (_, index) => `e${index}`);
    expect(describeExpenseProposalState(series, { status: 'written', writtenIds: ids, at: NOW }, local)).toMatchObject({ line: '12 righe registrate', feeLine: '+ 12 commissioni' });
    const one = resolveExpenseProposal(proposal({ fee: { amount: 1 } }), refs({ feeCategory: FEE_CATEGORY }), NOW);
    expect(describeExpenseProposalState(one, { status: 'written', writtenIds: ['e0', 'e1'], at: NOW }, local)).toMatchObject({ line: 'Registrata', feeLine: '+ 1 commissione' });
  });

  it('says a row the form wrote is the form’s', () => {
    const resolved = resolveExpenseProposal(proposal(), refs(), NOW);
    expect(describeExpenseProposalState(resolved, { status: 'written', writtenIds: ['e0'], month: '2026-10', at: NOW }, local).line).toBe('registrata da Modifica');
  });
});
