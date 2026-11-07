/**
 * Tests for the weekly budget email service — Sunday detection, data builder and
 * HTML render. The Admin SDK, Resend and firebase-admin Timestamp are mocked;
 * the budget maths is the real pure layer (budgetUtils).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock state, filled per test (mock-prefixed so it can be referenced in factories).
let mockBudgetDoc: { exists: boolean; data?: () => unknown } = { exists: false };
let mockExpenseDocs: Array<{ data: () => unknown }> = [];
let mockCategoryDocs: Array<{ id: string; data: () => unknown }> = [];

vi.mock('server-only', () => ({}));
vi.mock('firebase-admin/firestore', () => ({ Timestamp: { fromDate: (d: Date) => d } }));
// The CASHFLOW 12 MESI block the AI comment reads (decision 81, 2026-11-07).
const { readCashflowBlockMock } = vi.hoisted(() => ({ readCashflowBlockMock: vi.fn() }));
vi.mock('@/lib/server/assistant/cashflowBlockPrompt', () => ({ readCashflowBlockForPrompt: readCashflowBlockMock }));
vi.mock('resend', () => ({
  Resend: class {
    emails = { send: async () => ({ error: null }) };
  },
}));
vi.mock('@/lib/firebase/admin', () => ({
  adminDb: {
    collection: (name: string) => {
      const chain: Record<string, unknown> = {
        doc: () => ({ get: () => Promise.resolve(mockBudgetDoc) }),
        where: () => chain,
        get: () => Promise.resolve({ docs: name === 'expenseCategories' ? mockCategoryDocs : mockExpenseDocs }),
      };
      return chain;
    },
  },
}));

// The SDK is imported lazily inside the comment generator: one fake client answers on both
// `messages.create` and `beta.messages.create`, so the test reads the response handling, not
// which door the request went through.
const { anthropicCreateMock } = vi.hoisted(() => ({ anthropicCreateMock: vi.fn() }));
vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { create: anthropicCreateMock };
    beta = { messages: { create: anthropicCreateMock } };
  },
}));

import {
  isWeeklyBudgetDayItaly,
  buildWeeklyBudgetData,
  buildWeeklyBudgetEmailHtml,
  buildCommentContext,
  buildAndSendWeeklyBudget,
  generateWeeklyBudgetComment,
  type WeeklyBudgetData,
} from '@/lib/server/weeklyBudgetEmailService';
import { EMAIL_ANALYSIS_MODEL, SERVER_SIDE_FALLBACK_BETA } from '@/lib/constants/aiModels';

function expenseDoc(
  amount: number,
  date: Date,
  categoryId = 'c1',
  type = 'fixed',
  notes?: string,
  subCategoryName?: string
) {
  return { data: () => ({ type, categoryId, amount, notes, subCategoryName, date: { toDate: () => date } }) };
}

describe('isWeeklyBudgetDayItaly', () => {
  it('is true on a Sunday and false otherwise', () => {
    expect(isWeeklyBudgetDayItaly(new Date(2026, 2, 1, 12))).toBe(true); // 2026-03-01 is a Sunday
    expect(isWeeklyBudgetDayItaly(new Date(2026, 2, 2, 12))).toBe(false); // Monday
  });
});

describe('buildWeeklyBudgetData', () => {
  const now = new Date(2026, 5, 15, 12); // June 15 2026 (30-day month)

  beforeEach(() => {
    mockBudgetDoc = { exists: false };
    mockExpenseDocs = [];
    mockCategoryDocs = [];
  });

  it('returns null when the user has no budget document', async () => {
    expect(await buildWeeklyBudgetData('u1', now)).toBeNull();
  });

  it('builds rows, the overall row and at-risk counts from the pure layer', async () => {
    mockBudgetDoc = {
      exists: true,
      data: () => ({
        items: [{ id: 'g', kind: 'expense', scope: 'category', period: 'monthly', categoryId: 'c1', categoryName: 'Spesa', amount: 400, order: 0 }],
        overallMonthlyAmount: 1000,
      }),
    };
    mockExpenseDocs = [expenseDoc(-360, new Date(2026, 5, 10))];

    const data = await buildWeeklyBudgetData('u1', now);
    expect(data).not.toBeNull();
    expect(data!.rows).toHaveLength(1);
    expect(data!.rows[0].label).toBe('Spesa');
    expect(data!.rows[0].spent).toBeCloseTo(360);
    // 360/400 = 0.9, and the projection (360/15×30 = 720) exceeds 400 → over
    expect(data!.rows[0].status).toBe('over');
    expect(data!.atRiskCount).toBe(1);
    expect(data!.overall).not.toBeNull();
    expect(data!.overall!.spent).toBeCloseTo(360);
    expect(data!.yearElapsedPct).toBeGreaterThan(0);
  });

  it('reads the category type for the pace: a fixed category is never projected by the day', async () => {
    mockBudgetDoc = {
      exists: true,
      data: () => ({
        items: [{ id: 'r', kind: 'expense', scope: 'category', period: 'monthly', categoryId: 'c-home', categoryName: 'Casa', amount: 1300, order: 0 }],
      }),
    };
    // Rent on the 1st: 1150/15×30 = 2300 by pace, but the category is fixed.
    mockExpenseDocs = [expenseDoc(-1150, new Date(2026, 5, 1), 'c-home')];
    mockCategoryDocs = [{ id: 'c-home', data: () => ({ type: 'fixed' }) }];

    const data = await buildWeeklyBudgetData('u1', now);
    expect(data!.rows[0].projected).toBeCloseTo(1150);
    expect(data!.rows[0].status).toBe('warning'); // 88%, not over
  });

  it('attaches the contributing expenses to a category budget that exceeded its limit', async () => {
    mockBudgetDoc = {
      exists: true,
      data: () => ({
        items: [{ id: 'cf', kind: 'expense', scope: 'category', period: 'monthly', categoryId: 'c1', categoryName: 'Cibo fuori', amount: 70, order: 0 }],
      }),
    };
    mockExpenseDocs = [
      expenseDoc(-100, new Date(2026, 5, 10), 'c1', 'variable', 'Cena con amici', 'Ristoranti'),
      expenseDoc(-63, new Date(2026, 5, 12), 'c1', 'variable', undefined, 'Fast food'),
    ];

    const data = await buildWeeklyBudgetData('u1', now);
    const row = data!.rows[0];
    expect(row.ratio).toBeGreaterThan(1); // 163 / 70
    expect(row.overspendExpenses).toHaveLength(2);
    // Sorted by absolute amount descending; note used as description, label as fallback.
    expect(row.overspendExpenses![0]).toMatchObject({ description: 'Cena con amici', subCategory: 'Ristoranti', amount: 100 });
    expect(row.overspendExpenses![1]).toMatchObject({ description: 'Cibo fuori', subCategory: 'Fast food', amount: 63 });

    const html = buildWeeklyBudgetEmailHtml(data!);
    expect(html).toContain('Cena con amici');
    expect(html).toContain('Ristoranti');
  });

  it('omits the subcategory for a subcategory-scoped budget (avoids repeating the budget title)', async () => {
    mockBudgetDoc = {
      exists: true,
      data: () => ({
        items: [{ id: 's', kind: 'expense', scope: 'subcategory', period: 'monthly', categoryId: 'c1', categoryName: 'Cibo', subCategoryId: 's1', subCategoryName: 'Ristoranti', amount: 50, order: 0 }],
      }),
    };
    mockExpenseDocs = [
      { data: () => ({ type: 'variable', categoryId: 'c1', subCategoryId: 's1', subCategoryName: 'Ristoranti', amount: -80, notes: 'Cena', date: { toDate: () => new Date(2026, 5, 10) } }) },
    ];

    const data = await buildWeeklyBudgetData('u1', now);
    expect(data!.rows[0].overspendExpenses![0]).toMatchObject({ description: 'Cena', amount: 80 });
    expect(data!.rows[0].overspendExpenses![0].subCategory).toBeUndefined();
  });

  it('does not attach expenses to a row that is over by projection only (ratio ≤ 1)', async () => {
    mockBudgetDoc = {
      exists: true,
      data: () => ({
        items: [{ id: 'g', kind: 'expense', scope: 'category', period: 'monthly', categoryId: 'c1', categoryName: 'Spesa', amount: 400, order: 0 }],
      }),
    };
    mockExpenseDocs = [expenseDoc(-360, new Date(2026, 5, 10))];

    const data = await buildWeeklyBudgetData('u1', now);
    expect(data!.rows[0].status).toBe('over'); // projection overrun
    expect(data!.rows[0].ratio).toBeLessThanOrEqual(1);
    expect(data!.rows[0].overspendExpenses).toBeUndefined();
  });

  it('never attaches a breakdown to the overall budget', async () => {
    mockBudgetDoc = {
      exists: true,
      data: () => ({ items: [], overallMonthlyAmount: 100 }),
    };
    mockExpenseDocs = [expenseDoc(-500, new Date(2026, 5, 10))];

    const data = await buildWeeklyBudgetData('u1', now);
    expect(data!.overall!.ratio).toBeGreaterThan(1);
    expect(data!.overall!.overspendExpenses).toBeUndefined();
  });

  it('renders an HTML email containing the budget label and header', async () => {
    mockBudgetDoc = {
      exists: true,
      data: () => ({
        items: [{ id: 'a', kind: 'expense', scope: 'category', period: 'annual', categoryId: 'c1', categoryName: 'Vacanze', amount: 2000, order: 0 }],
      }),
    };
    mockExpenseDocs = [expenseDoc(-500, new Date(2026, 4, 10))];

    const data = await buildWeeklyBudgetData('u1', now);
    const html = buildWeeklyBudgetEmailHtml(data!);
    expect(html).toContain('Stato dei budget');
    expect(html).toContain('Vacanze');
    expect(html).toContain('Budget annuali');
    // The email opens on a rule-generated verdict, like every other surface.
    expect(html).toMatch(/budget (è in linea|su \d+ (è|sono) in linea)|tetto del mese/);
  });

  it('states in the email that the amounts are month-to-date, not weekly', async () => {
    mockBudgetDoc = {
      exists: true,
      data: () => ({ items: [], overallMonthlyAmount: 2200 }),
    };
    mockExpenseDocs = [expenseDoc(-1800, new Date(2026, 5, 10))];

    const data = await buildWeeklyBudgetData('u1', now);
    const html = buildWeeklyBudgetEmailHtml(data!);
    // Each tile names its own window in its scope, with the month spelled out.
    expect(html).toMatch(/dal 1° [a-zà-ù]+ a oggi/);
    expect(html).toContain('nessun importo è settimanale');
    // A bare "proiezione €X" was read as a year-end figure — the horizon must be spelled out.
    expect(html).toContain('proiezione a fine mese');
    // And the verdict states where in the month we are, which is what makes the ceiling legible.
    expect(html).toMatch(/Al giorno/);
  });
});

describe('buildCommentContext', () => {
  const now = new Date(2026, 5, 15, 12); // June 15 2026 (30-day month)

  it('declares the monthly horizon of the overall budget and its end-of-month projection', async () => {
    // Reproduces the production error: the model called the overall projection a
    // year-end figure because the prompt never said the ceiling was monthly.
    mockBudgetDoc = {
      exists: true,
      data: () => ({ items: [], overallMonthlyAmount: 2200 }),
    };
    mockExpenseDocs = [expenseDoc(-1800, new Date(2026, 5, 10))];

    const data = await buildWeeklyBudgetData('u1', now);
    const context = buildCommentContext(data!);

    expect(context).toContain('tetto MENSILE');
    expect(context).toContain('proiezione A FINE MESE');
    expect(context).toContain('dal 1° giugno a oggi');
    expect(context).toContain('giorno 15 di 30');
  });

  it('scopes annual budgets to the year and monthly budgets to the month', async () => {
    mockBudgetDoc = {
      exists: true,
      data: () => ({
        items: [
          { id: 'a', kind: 'expense', scope: 'category', period: 'annual', categoryId: 'c1', categoryName: 'Vacanze', amount: 2000, order: 0 },
          { id: 'b', kind: 'expense', scope: 'category', period: 'monthly', categoryId: 'c2', categoryName: 'Tecnologia', amount: 200, order: 1 },
        ],
      }),
    };
    mockExpenseDocs = [
      expenseDoc(-500, new Date(2026, 2, 10), 'c1'),
      expenseDoc(-150, new Date(2026, 5, 10), 'c2'),
    ];

    const data = await buildWeeklyBudgetData('u1', now);
    const context = buildCommentContext(data!);

    expect(context).toContain('Vacanze (budget di spesa ANNUALE): 500€ da inizio anno a oggi');
    expect(context).toContain('Tecnologia (budget di spesa MENSILE): 150€ dal 1° giugno a oggi');
  });
});

describe('generateWeeklyBudgetComment', () => {
  const data: WeeklyBudgetData = {
    rows: [],
    overall: null,
    yearElapsedPct: 50,
    onTrackCount: 0,
    atRiskCount: 0,
    generatedAt: new Date(2026, 5, 14, 12),
  };
  const previousKey = process.env.ANTHROPIC_API_KEY;

  /** A non-streamed response: a thinking block, then the text, then why it stopped. */
  function answer(text: string, stopReason: string) {
    return {
      model: 'claude-sonnet-5-5',
      content: [
        { type: 'thinking', thinking: '', signature: 'sig' },
        { type: 'text', text },
      ],
      stop_reason: stopReason,
    };
  }

  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    anthropicCreateMock.mockReset();
  });

  afterEach(() => {
    if (previousKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = previousKey;
  });

  it('keeps a comment that ends on end_turn', async () => {
    anthropicCreateMock.mockResolvedValue(answer('Spesa al 50% del tetto. Rimanda un acquisto.', 'end_turn'));

    expect(await generateWeeklyBudgetComment(data)).toBe('Spesa al 50% del tetto. Rimanda un acquisto.');
  });

  it('asks for the default server-side fallback', async () => {
    anthropicCreateMock.mockResolvedValue(answer('Spesa al 50% del tetto.', 'end_turn'));

    await generateWeeklyBudgetComment(data);

    expect(anthropicCreateMock.mock.calls[0][0]).toMatchObject({
      model: EMAIL_ANALYSIS_MODEL,
      betas: [SERVER_SIDE_FALLBACK_BETA],
      fallbacks: 'default',
    });
  });

  it('keeps a comment the fallback model wrote after a decline', async () => {
    anthropicCreateMock.mockResolvedValue({
      ...answer('Spesa al 50% del tetto.', 'end_turn'),
      model: 'claude-sonnet-5',
    });

    expect(await generateWeeklyBudgetComment(data)).toBe('Spesa al 50% del tetto.');
  });

  it('drops a comment the model declined half-way (stop_reason refusal)', async () => {
    // Sonnet 5.5 declines with HTTP 200: the half sentence written before the refusal must
    // not reach the inbox as if it were the comment.
    anthropicCreateMock.mockResolvedValue(answer('Spesa al 50% del', 'refusal'));

    expect(await generateWeeklyBudgetComment(data)).toBeNull();
  });

  it('drops a comment cut at max_tokens', async () => {
    anthropicCreateMock.mockResolvedValue(answer('Spesa al 50% del tetto. Rimanda', 'max_tokens'));

    expect(await generateWeeklyBudgetComment(data)).toBeNull();
  });

  it('prints the note and the cashflow block under the budgets, and nothing without one (decision 81)', async () => {
    anthropicCreateMock.mockResolvedValue(answer('Spesa al 50% del tetto.', 'end_turn'));
    await generateWeeklyBudgetComment(data, '--- CASHFLOW 12 MESI (x) ---\nX');
    await generateWeeklyBudgetComment(data);
    const withBlock = (anthropicCreateMock.mock.calls[0][0] as { messages: { content: string }[] }).messages[0].content;
    const without = (anthropicCreateMock.mock.calls[1][0] as { messages: { content: string }[] }).messages[0].content;
    const context = buildCommentContext(data);
    expect(withBlock).toContain(`${context}\n\nIl blocco CASHFLOW 12 MESI qui sotto è il cashflow di tutta la storia registrata fino a oggi`);
    expect(withBlock).toContain("i conti.\n--- CASHFLOW 12 MESI (x) ---\nX\n\nREGOLE");
    expect(without).not.toContain('CASHFLOW 12 MESI');
    expect(without).toContain(`${context}\n\nREGOLE`);
  });
});

describe('buildAndSendWeeklyBudget — the cashflow block (decision 81)', () => {
  const now = new Date(2026, 5, 15, 12);
  const previousKey = process.env.ANTHROPIC_API_KEY;

  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    anthropicCreateMock.mockReset();
    readCashflowBlockMock.mockReset();
    mockBudgetDoc = {
      exists: true,
      data: () => ({
        items: [{ id: 'g', kind: 'expense', scope: 'category', period: 'monthly', categoryId: 'c1', categoryName: 'Spesa', amount: 400, order: 0 }],
        overallMonthlyAmount: 1000,
      }),
    };
    mockExpenseDocs = [expenseDoc(-360, new Date(2026, 5, 10))];
    mockCategoryDocs = [];
  });

  afterEach(() => {
    if (previousKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = previousKey;
  });

  it('reads the block once for the user, at the send instant, and hands it to the comment', async () => {
    readCashflowBlockMock.mockResolvedValue('--- CASHFLOW 12 MESI (x) ---\nX');
    anthropicCreateMock.mockResolvedValue({
      model: 'claude-sonnet-5-5', content: [{ type: 'text', text: 'Ok.' }], stop_reason: 'end_turn',
    });
    expect(await buildAndSendWeeklyBudget('u1', ['a@example.com'], now)).toBe(true);
    expect(readCashflowBlockMock).toHaveBeenCalledWith('u1', now);
    const prompt = (anthropicCreateMock.mock.calls[0][0] as { messages: { content: string }[] }).messages[0].content;
    expect(prompt).toContain('--- CASHFLOW 12 MESI (x) ---\nX');
  });

  it('a failed read sends the email without the comment and spends no call', async () => {
    readCashflowBlockMock.mockRejectedValue(new Error('read failed'));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(await buildAndSendWeeklyBudget('u1', ['a@example.com'], now)).toBe(true);
    expect(anthropicCreateMock).not.toHaveBeenCalled();
  });
});
