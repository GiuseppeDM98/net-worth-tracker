import { describe, it, expect } from 'vitest';
import {
  armedActionLabel,
  describeAssetIntent,
  describeCashAccountReading,
  describeCategoryDeleteReading,
  describeCategoryMoveReading,
  describeDividendDayReading,
  describeDividendIntent,
  describeDividendDeleteConsequence,
  describeScrapeReading,
  describeDummyDataReading,
  describeExpenseDeleteConsequence,
  describeExpenseIntent,
  describeFormRefusal,
  describeSeriesDeleteReading,
  describeLinkSeriesReading,
  describeLedgerReturnVital,
  describeModalStatus,
  describeMovementDetailReading,
  describeMovementsFilterAction,
  describeMovementsFilterReading,
  describeMovementsReading,
  describePensionValueCopy,
  describeSettlementTiming,
  describeWithheldTaxField,
  describeSnapshotOverwrite,
  describeTransferFeeField,
  describeDebtRepaymentField,
  describeTradeIntent,
  describeWriteError,
  pluralize,
  userFacingError,
  ASSET_TYPE_PICKER_READING,
  EXPENSE_TYPE_PICKER_READING,
  PENSION_CONTRIBUTION_COPY,
  PENSION_CONTRIBUTION_RECORDED,
  type ModalStatusCopy,
} from '@/lib/utils/dialogNarrative';
import { narrativeToText, type Narrative } from '@/lib/utils/narrative';

/**
 * `Intl('it-IT')` puts a NO-BREAK space before the €, and the tests read the way the screen
 * prints — so the nbsp is flattened rather than the formatter "fixed" (doc/guide/panoramica.md § Panoramica and Dashboard Data Isolation).
 */
function plain(narrative: Narrative): string {
  return narrativeToText(narrative).replace(/ /g, ' ');
}

const COPY: ModalStatusCopy = {
  idle: [{ text: 'Serve un importo.' }],
  submitting: 'Sto salvando.',
  success: 'Salvato.',
};

describe('describeModalStatus', () => {
  it('reads the idle sentence in the neutral tone', () => {
    const reading = describeModalStatus({ phase: 'idle' }, COPY);
    expect(plain(reading.narrative)).toBe('Serve un importo.');
    expect(reading.tone).toBe('neutral');
  });

  it('reads what the form is doing while it submits', () => {
    const reading = describeModalStatus({ phase: 'submitting' }, COPY);
    expect(plain(reading.narrative)).toBe('Sto salvando.');
    expect(reading.tone).toBe('neutral');
  });

  it('falls back to the submitting sentence when no success copy is declared', () => {
    const reading = describeModalStatus({ phase: 'success' }, { idle: COPY.idle, submitting: 'Sto salvando.' });
    expect(plain(reading.narrative)).toBe('Sto salvando.');
  });

  it('paints a failure negative and carries the message it was given', () => {
    const reading = describeModalStatus({ phase: 'error', message: 'Il conto non esiste più.' }, COPY);
    expect(plain(reading.narrative)).toBe('Il conto non esiste più.');
    expect(reading.tone).toBe('negative');
  });

  it('never leaves an error empty, even with no message', () => {
    const reading = describeModalStatus({ phase: 'error' }, COPY);
    expect(reading.tone).toBe('negative');
    expect(plain(reading.narrative).length).toBeGreaterThan(0);
  });
});

describe('describeWriteError', () => {
  it('translates a mapped Firestore code into Italian', () => {
    expect(describeWriteError({ code: 'permission-denied' })).toBe(
      'Non hai i permessi per scrivere su questo account.',
    );
  });

  it('never falls through to the SDK string for an unmapped code', () => {
    const sdkError = Object.assign(new Error('Missing or insufficient permissions.'), {
      code: 'internal',
    });
    const message = describeWriteError(sdkError);
    expect(message).not.toContain('Missing or insufficient permissions.');
    expect(message).toBe('Non è stato possibile completare l’operazione. Riprova.');
  });

  it('keeps a message the server wrote for a reader', () => {
    const server = userFacingError('Non puoi vendere 12 quote: ne possiedi 8.');
    expect(describeWriteError(server)).toBe('Non puoi vendere 12 quote: ne possiedi 8.');
  });

  it('drops a plain Error, which is a log line rather than a sentence', () => {
    expect(describeWriteError(new Error('Request failed with status 500'))).toBe(
      'Non è stato possibile completare l’operazione. Riprova.',
    );
  });
});

describe('armedActionLabel', () => {
  it('repeats the consequence instead of asking a question about it', () => {
    expect(armedActionLabel('Elimina 47 movimenti')).toBe('Premi di nuovo per elimina 47 movimenti');
  });

  it('lowercases the opening word so the label reads as one sentence', () => {
    expect(armedActionLabel('Sposta i movimenti')).toBe('Premi di nuovo per sposta i movimenti');
  });

  it('leaves an acronym alone: lowering it would rename the thing', () => {
    expect(armedActionLabel('PMC azzerato')).toBe('Premi di nuovo per PMC azzerato');
  });
});

describe('pluralize', () => {
  it('agrees with the count', () => {
    expect(pluralize(1, 'movimento', 'movimenti')).toBe('1 movimento');
    expect(pluralize(47, 'movimento', 'movimenti')).toBe('47 movimenti');
    expect(pluralize(0, 'movimento', 'movimenti')).toBe('0 movimenti');
  });
});

describe('describeMovementsReading', () => {
  const base = {
    buys: 0,
    sells: 0,
    adjustments: 0,
    hasBaseline: false,
    averageCostEur: null,
    firstDate: null,
  };

  it('says an empty ledger is empty, and what opens it', () => {
    expect(plain(describeMovementsReading(base))).toBe(
      'Nessuna operazione registrata: il primo acquisto apre la posizione.',
    );
  });

  it('counts the operations by kind and names the average cost', () => {
    expect(
      plain(
        describeMovementsReading({
          buys: 5,
          sells: 1,
          adjustments: 0,
          hasBaseline: true,
          averageCostEur: 108.42,
          firstDate: new Date(2023, 0, 12),
        }),
      ),
    ).toBe('7 operazioni dal 12/01/2023: 5 acquisti, 1 vendita e la posizione iniziale; PMC 108,42 €.');
  });

  it('drops a kind with nothing behind it rather than printing a zero', () => {
    const text = plain(
      describeMovementsReading({ ...base, buys: 3, averageCostEur: 12, firstDate: new Date(2024, 5, 1) }),
    );
    expect(text).toBe('3 operazioni dal 01/06/2024: 3 acquisti; PMC 12,00 €.');
    expect(text).not.toContain('vendite');
    expect(text).not.toContain('rettifiche');
  });

  it('drops the PMC clause when the replay cannot produce one', () => {
    const text = plain(describeMovementsReading({ ...base, buys: 1, sells: 1 }));
    expect(text).not.toContain('PMC');
    expect(text).toBe('2 operazioni: 1 acquisto e 1 vendita.');
  });

  it('agrees in number on a single operation', () => {
    expect(plain(describeMovementsReading({ ...base, hasBaseline: true }))).toBe(
      '1 operazione: la posizione iniziale.',
    );
  });

  it('joins three kinds the Italian way', () => {
    expect(
      plain(describeMovementsReading({ ...base, buys: 2, sells: 1, adjustments: 1 })),
    ).toBe('4 operazioni: 2 acquisti, 1 vendita e 1 rettifica.');
  });
});

describe('describeCategoryDeleteReading', () => {
  it('states the count and the amount before the controls that decide their fate', () => {
    expect(
      plain(
        describeCategoryDeleteReading({
          name: 'Casa',
          isSubCategory: false,
          expenseCount: 47,
          totalEur: 12480,
        }),
      ),
    ).toBe('47 movimenti sono in Casa, per 12.480,00 €: decidi dove finiscono prima di eliminarla.');
  });

  it('drops the money clause where the surface does not know the amount', () => {
    const text = plain(
      describeCategoryDeleteReading({ name: 'Casa', isSubCategory: false, expenseCount: 47, totalEur: null }),
    );
    expect(text).toBe('47 movimenti sono in Casa: decidi dove finiscono prima di eliminarla.');
    expect(text).not.toContain('€');
  });

  it('says an empty category costs nothing to delete', () => {
    expect(
      plain(
        describeCategoryDeleteReading({
          name: 'Svago',
          isSubCategory: true,
          expenseCount: 0,
          totalEur: null,
        }),
      ),
    ).toBe('Nessun movimento usa la sottocategoria Svago: eliminandola non cambia nessun totale.');
  });

  it('agrees in number on one row', () => {
    expect(
      plain(
        describeCategoryDeleteReading({ name: 'Casa', isSubCategory: false, expenseCount: 1, totalEur: null }),
      ),
    ).toContain('1 movimento è in Casa');
  });
});

describe('describeCategoryMoveReading', () => {
  it('says what survives the move, which is what separates it from a delete', () => {
    expect(plain(describeCategoryMoveReading({ name: 'Casa', expenseCount: 47 }))).toBe(
      '47 movimenti passano alla categoria che scegli. Casa resta dov’è, vuota.',
    );
  });

  it('says an empty category has nothing to move', () => {
    expect(plain(describeCategoryMoveReading({ name: 'Casa', expenseCount: 0 }))).toBe(
      'Non c’è nessun movimento da spostare: Casa è già vuota.',
    );
  });
});

describe('describeDividendIntent', () => {
  it('asks for the instrument and the gross amount, and names where the withholding comes from', () => {
    expect(narrativeToText(describeDividendIntent({ isEdit: false }))).toBe(
      'Scegli lo strumento e l’importo lordo per unità: la ritenuta è proposta dall’aliquota dello strumento e resta modificabile. Un pagamento datato in futuro resta «annunciato» finché la data non arriva.'
    );
  });

  it('names the record on an edit, as a coupon for a bond', () => {
    expect(narrativeToText(describeDividendIntent({ isEdit: true, ticker: 'BTP Valore', isBond: true }))).toContain(
      'Stai modificando la cedola di BTP Valore.'
    );
    expect(narrativeToText(describeDividendIntent({ isEdit: true, ticker: 'ENI' }))).toContain('Stai modificando il dividendo di ENI.');
  });
});

describe('describeDividendDeleteConsequence', () => {
  it('says what leaves the registry, and the Cashflow when a booked expense goes with it', () => {
    expect(describeDividendDeleteConsequence({ what: 'la cedola', paymentDate: '10/12/2026', hasExpense: true })).toBe(
      'Eliminando, la cedola del 10/12/2026 sparisce dal registro e dal Cashflow.'
    );
    expect(describeDividendDeleteConsequence({ what: 'il dividendo', paymentDate: '20/05/2026', hasExpense: false })).toBe(
      'Eliminando, il dividendo del 20/05/2026 sparisce dal registro.'
    );
  });
});

describe('describeScrapeReading', () => {
  it('names the instruments and the floor before the run', () => {
    expect(narrativeToText(describeScrapeReading(['VWCE', 'AAPL', 'BTP']))).toBe(
      'Scarico da Borsa Italiana i dividendi di VWCE, AAPL e BTP. I pagamenti precedenti alla data in cui possiedi ogni titolo vengono scartati: puoi spostarla registrando l’acquisto nel Registro operazioni.'
    );
  });

  it('counts them past four, and says when there is nothing to download', () => {
    expect(narrativeToText(describeScrapeReading(['A', 'B', 'C', 'D', 'E']))).toContain('i dividendi di 5 strumenti con ISIN.');
    expect(narrativeToText(describeScrapeReading([]))).toBe('Nessuno strumento ha un ISIN: non c’è nulla da scaricare.');
  });
});

describe('describeDividendDayReading', () => {
  it('keeps received and announced apart, never as one total', () => {
    const text = plain(
      describeDividendDayReading({
        received: 2,
        announced: 1,
        receivedEur: 148.4,
        announcedEur: 57,
      }),
    );
    expect(text).toBe('2 incassati (148,40 €) e 1 annunciato (57,00 €) in questa data.');
  });

  it('signs the received half as a gain and leaves the announced half uncoloured', () => {
    const narrative = describeDividendDayReading({
      received: 1,
      announced: 1,
      receivedEur: 10,
      announcedEur: 20,
    });
    const received = narrative.find((s) => s.text.startsWith('10,'));
    const announced = narrative.find((s) => s.text.startsWith('20,'));
    expect(received?.sign).toBe('positive');
    expect(announced?.sign).toBeUndefined();
  });

  it('drops the half that is empty', () => {
    expect(
      plain(describeDividendDayReading({ received: 3, announced: 0, receivedEur: 90, announcedEur: 0 })),
    ).toBe('3 incassati (90,00 €) in questa data.');
  });

  it('says a day with nothing on it', () => {
    expect(
      plain(describeDividendDayReading({ received: 0, announced: 0, receivedEur: 0, announcedEur: 0 })),
    ).toBe('Nessun pagamento in questa data.');
  });
});

describe('describeDummyDataReading', () => {
  it('names what is about to be lost', () => {
    expect(
      plain(describeDummyDataReading({ snapshots: 24, expenses: 300, categories: 6, total: 330 })),
    ).toBe('330 elementi di test escono per sempre dai totali, dallo Storico e dai budget.');
  });

  it('says there is nothing to delete', () => {
    expect(plain(describeDummyDataReading({ snapshots: 0, expenses: 0, categories: 0, total: 0 }))).toBe(
      'Non c’è nessun dato di test da eliminare: l’account contiene solo i tuoi.',
    );
  });
});

describe('describeExpenseIntent', () => {
  it('says what a transfer is NOT counted in, which is the whole point of the type', () => {
    const text = plain(describeExpenseIntent('transfer'));
    expect(text).toContain('non entra in spese, entrate né budget');
  });

  it('says an instalment is not projected, because it falls on a fixed day', () => {
    expect(plain(describeExpenseIntent('debt'))).toContain('non viene proiettata a fine mese');
  });

  it('gives income its own consequence', () => {
    expect(plain(describeExpenseIntent('income'))).toContain('risparmio del mese');
  });

  it('names the three consequences of the type on the picker', () => {
    const text = plain(EXPENSE_TYPE_PICKER_READING);
    expect(text).toContain('categorie');
    expect(text).toContain('conto');
    expect(text).toContain('budget');
  });
});

describe('describeTradeIntent', () => {
  const base = { isBaseline: false, hasSettlement: false, isDemo: false } as const;

  it('drops the balance clause when no settlement account is chosen', () => {
    const text = plain(describeTradeIntent({ ...base, type: 'buy' }));
    expect(text).toContain('Senza conto di regolamento nessun saldo si muove.');
  });

  it('states the balance effect when one is chosen', () => {
    expect(plain(describeTradeIntent({ ...base, type: 'buy', hasSettlement: true }))).toBe(
      'Un acquisto aggiunge quote al PMC e scala il conto di regolamento.',
    );
  });

  it('says an adjustment realizes nothing and touches no balance', () => {
    const text = plain(describeTradeIntent({ ...base, type: 'adjustment', hasSettlement: true }));
    expect(text).toContain('nessuna plusvalenza realizzata');
    expect(text).toContain('nessun saldo toccato');
  });

  it('says what a baseline can and cannot change', () => {
    expect(plain(describeTradeIntent({ ...base, type: 'buy', isBaseline: true }))).toContain(
      'quantità, prezzo e nota, non la data',
    );
  });

  it('says the register is read-only in demo, before anything else', () => {
    expect(plain(describeTradeIntent({ ...base, type: 'sell', isDemo: true }))).toBe(
      'In modalità demo il registro operazioni è di sola lettura.',
    );
  });
});

describe('describeWithheldTaxField', () => {
  it('should say the prefill is an estimate to correct from the statement', () => {
    expect(describeWithheldTaxField({ isEdit: false, isLegacySettledSell: false, hasEstimate: true, isTyped: false })).toContain('Stima');
  });

  it('should stop calling the figure an estimate once the owner has typed it', () => {
    expect(describeWithheldTaxField({ isEdit: false, isLegacySettledSell: false, hasEstimate: true, isTyped: true })).not.toContain('Stima');
  });

  it('should say why a new sale has no prefill', () => {
    expect(describeWithheldTaxField({ isEdit: false, isLegacySettledSell: false, hasEstimate: false, isTyped: false })).toContain('non c’è stima');
  });

  it('should warn that a tax typed on a sale already credited gross lowers the account today', () => {
    const warning = describeWithheldTaxField({ isEdit: true, isLegacySettledSell: true, hasEstimate: true, isTyped: false });
    expect(warning).toContain('oggi il conto scende');
    expect(warning).toContain('lascia vuoto');
  });

  it('should not warn on an edit of a sale that already stores its tax', () => {
    expect(describeWithheldTaxField({ isEdit: true, isLegacySettledSell: false, hasEstimate: true, isTyped: false })).not.toContain('oggi');
  });
});

describe('describeSettlementTiming', () => {
  it('promises the automatic update for a trade dated in the current month', () => {
    expect(describeSettlementTiming('2026-09-02', '2026-09-13')).toBe(
      'Se selezionato, il saldo del conto viene aggiornato automaticamente.',
    );
  });

  it('warns that the balance moves today for a trade dated in an earlier month', () => {
    // A purchase recorded years later has already left the account: settling it again would
    // debit it twice, and the sentence has to say so before the user picks an account.
    expect(describeSettlementTiming('2024-03-15', '2026-09-13')).toBe(
      "Il saldo del conto si muove oggi, non alla data dell'operazione: se lo riflette già, lascia «Nessuno».",
    );
    // The month boundary, not a number of days: the 31st against the 1st is a past month.
    expect(describeSettlementTiming('2026-08-31', '2026-09-01')).toContain('si muove oggi');
  });

  it('reads an empty or malformed date as today', () => {
    expect(describeSettlementTiming('', '2026-09-13')).toContain('aggiornato automaticamente');
    expect(describeSettlementTiming('2026', '2026-09-13')).toContain('aggiornato automaticamente');
  });
});

describe('describeAssetIntent', () => {
  it('declares who owns quantity and average cost on a ledger asset', () => {
    expect(plain(describeAssetIntent({ isEdit: true, hasLedger: true, isLedgerCreate: false }))).toContain(
      'registro operazioni',
    );
  });

  it('does not mention the ledger on an asset that has none', () => {
    const text = plain(describeAssetIntent({ isEdit: true, hasLedger: false, isLedgerCreate: false }));
    expect(text).not.toContain('registro operazioni');
  });

  it('warns that a create will open the position with a first buy', () => {
    expect(plain(describeAssetIntent({ isEdit: false, hasLedger: false, isLedgerCreate: true }))).toContain(
      'acquisto di apertura',
    );
  });

  it('names the three consequences of the type on the picker', () => {
    const text = plain(ASSET_TYPE_PICKER_READING);
    expect(text).toContain('campi');
    expect(text).toContain('prezzato');
    expect(text).toContain('Allocazione');
  });
});

describe('Previdenza modals', () => {
  it('states the trap of the value overwrite: the month’s contributions are already in the statement', () => {
    const withPaidIn = describePensionValueCopy({ fundName: null, currentValue: 29_800, monthPaidIn: 821, stale: false });
    expect(plain(withPaidIn.idle)).toBe('Il fondo vale 29.800,00 €: scrivi il valore dell’estratto conto. I 821,00 € versati questo mese sono già dentro l’estratto: non aggiungerli.');

    const named = describePensionValueCopy({ fundName: 'Cometa', currentValue: 100, monthPaidIn: 0, stale: true });
    expect(plain(named.idle)).toBe('Cometa vale 100,00 € da un mese chiuso: scrivi il valore dell’estratto conto. Se questo mese hai versato, registra prima i versamenti: l’estratto li include già.');
    expect(named.submitting).toBe('Aggiornamento del valore in corso…');
  });

  it('teaches the order in the toast after a contribution', () => {
    expect(PENSION_CONTRIBUTION_RECORDED.next).toContain('aggiorna il valore del fondo');
    expect(PENSION_CONTRIBUTION_RECORDED.action).toBe('Aggiorna valore');
    expect(plain(PENSION_CONTRIBUTION_COPY.idle)).toContain('alza la deduzione IRPEF');
  });
});

describe('describeFormRefusal — the reading line of a refused submit', () => {
  it('counts and names the missing fields, then the invalid ones, in an Italian list', () => {
    expect(describeFormRefusal(['Ticker', 'Nome'], [])).toBe('Mancano 2 campi: Ticker e Nome.');
    expect(describeFormRefusal(['Nome'], [])).toBe('Manca un campo: Nome.');
    expect(describeFormRefusal([], ['ISIN'])).toBe('Un valore non è valido: ISIN.');
    expect(describeFormRefusal(['Ticker', 'Nome', 'Valuta'], ['ISIN', 'TER'])).toBe(
      'Mancano 3 campi: Ticker, Nome e Valuta; 2 valori non sono validi: ISIN e TER.',
    );
    expect(describeFormRefusal([], [])).toBe('Controlla i campi evidenziati.');
  });
});

describe('describeCashAccountReading — the consequence lands in the reading while armed', () => {
  it('explains how the balance moves when idle, and what the second press loses when armed', () => {
    const idle = describeCashAccountReading({ name: 'Conto BNL', balanceEur: 6044.37, armed: false, isDemo: false });
    expect(idle.tone).toBe('neutral');
    expect(plain(idle.narrative)).toBe('Il saldo si muove da solo quando registri un movimento collegato a questo conto.');

    const armed = describeCashAccountReading({ name: 'Conto BNL', balanceEur: 6044.37, armed: true, isDemo: false });
    expect(armed.tone).toBe('negative');
    expect(plain(armed.narrative)).toBe(
      'Elimini Conto BNL e il suo saldo di 6044,37 €: i movimenti collegati restano nel cashflow senza conto. Non è reversibile.',
    );
  });

  it('is read-only in demo whatever the arm state', () => {
    expect(plain(describeCashAccountReading({ name: 'X', balanceEur: 1, armed: true, isDemo: true }).narrative)).toContain('sola lettura');
  });
});

describe('describeLedgerReturnVital — an XIRR only once the ledger spans six months', () => {
  it('annualises at or past the floor', () => {
    const vital = describeLedgerReturnVital({ xirr: 0.0812, totalReturnPct: 0.05, spanDays: 180, minAnnualizableDays: 180 });
    expect(vital).toMatchObject({ label: 'XIRR', sub: 'annualizzato' });
    expect(vital?.percent).toBeCloseTo(8.12, 6);
  });

  it('prints the period return with its window under the floor — never +4388% on 47 days', () => {
    const vital = describeLedgerReturnVital({ xirr: 43.8868, totalReturnPct: 0.669, spanDays: 47.4, minAnnualizableDays: 180 });
    expect(vital).toMatchObject({ label: 'Rendimento sul periodo', sub: 'in 47 giorni, non annualizzato' });
    expect(vital?.percent).toBeCloseTo(66.9, 6);
    expect(vital?.info).toContain('180 giorni');
    expect(describeLedgerReturnVital({ xirr: 1, totalReturnPct: 0.1, spanDays: 1, minAnnualizableDays: 180 })?.sub).toBe('in 1 giorno, non annualizzato');
  });

  it('falls back to the period return when the XIRR did not converge, and to nothing without a window', () => {
    expect(describeLedgerReturnVital({ xirr: null, totalReturnPct: 0.2, spanDays: 400, minAnnualizableDays: 180 })?.label).toBe('Rendimento sul periodo');
    expect(describeLedgerReturnVital({ xirr: null, totalReturnPct: null, spanDays: 400, minAnnualizableDays: 180 })).toBeNull();
    expect(describeLedgerReturnVital({ xirr: 0.1, totalReturnPct: 0.1, spanDays: null, minAnnualizableDays: 180 })).toBeNull();
  });
});

describe('describeExpenseDeleteConsequence — the row says what the second press does to the account', () => {
  it('names the balance that moves back, with the direction of the row', () => {
    const flat = (text: string) => text.replace(/ /g, ' ');
    expect(flat(describeExpenseDeleteConsequence({ type: 'variable', amount: -373.81, hasAccount: true }))).toBe('Eliminando, il conto viene riaccreditato di 373,81 €.');
    expect(flat(describeExpenseDeleteConsequence({ type: 'income', amount: 2456, hasAccount: true }))).toBe('Eliminando, il conto viene addebitato di 2456,00 €.');
  });

  it('says what a transfer and an unlinked row lose instead', () => {
    expect(describeExpenseDeleteConsequence({ type: 'transfer', amount: 500, hasAccount: true })).toBe('Eliminando, i due conti tornano come prima del trasferimento.');
    expect(describeExpenseDeleteConsequence({ type: 'transfer', amount: 500, hasAccount: false })).toBe('Eliminando, il trasferimento sparisce dal registro.');
    expect(describeExpenseDeleteConsequence({ type: 'fixed', amount: -40, hasAccount: false })).toBe('Eliminando, la voce sparisce dal periodo e dai budget.');
  });

  it('says that a transfer takes its fee with it', () => {
    expect(describeExpenseDeleteConsequence({ type: 'transfer', amount: 500, hasAccount: true, hasFee: true })).toBe('Eliminando, i due conti tornano come prima del trasferimento, e la sua commissione con lui.');
    expect(describeExpenseDeleteConsequence({ type: 'transfer', amount: 500, hasAccount: false, hasFee: true })).toBe('Eliminando, il trasferimento sparisce dal registro, e la sua commissione con lui.');
  });
});

describe('describeTransferFeeField — the line under a transfer\'s «Commissione»', () => {
  const flat = (text: string | null) => text?.replace(/\u00a0/g, ' ') ?? null;

  it('says what a typed fee does: more money out of the origin, as a spending row', () => {
    expect(flat(describeTransferFeeField({ amount: 1.5, categoryLabel: 'Commissioni › Bonifici', savedAmount: null }))).toBe(
      'Dal conto di origine escono 1,50 € in più: una spesa in Commissioni › Bonifici alla data del trasferimento.'
    );
  });

  it('invites the fee while the field is empty', () => {
    expect(describeTransferFeeField({ amount: null, categoryLabel: 'Commissioni', savedAmount: null })).toBe(
      "Il costo del bonifico, se c'è: diventa una spesa in Commissioni, addebitata sul conto di origine."
    );
  });

  it('says that clearing a saved fee deletes it and gives back what it paid', () => {
    expect(flat(describeTransferFeeField({ amount: null, categoryLabel: 'Commissioni', savedAmount: 2 }))).toBe(
      'Svuotata, la commissione di 2,00 € viene eliminata e il conto di origine riaccreditato di quanto aveva già pagato.'
    );
  });

  it('has nothing to say without somewhere for the fee to land (the form links Impostazioni)', () => {
    expect(describeTransferFeeField({ amount: 3, categoryLabel: null, savedAmount: null })).toBeNull();
  });
});

describe('describeSeriesDeleteReading — «solo questa o tutta la serie?»', () => {
  it('names the instalment, its plan and what the account gets back', () => {
    const text = plain(describeSeriesDeleteReading({ mode: 'installment', label: 'Figlie', amount: -373.81, installmentNumber: 3, installmentTotal: 12 }));
    expect(text).toBe('Rata 3 di 12 di Figlie, 373,81 €: puoi togliere solo questa o tutte le 12; il conto collegato torna come prima delle rate eliminate.');
  });

  it('names a recurring occurrence and its series', () => {
    const text = plain(describeSeriesDeleteReading({ mode: 'recurring', label: 'Palestra', amount: -40 }));
    expect(text).toBe('Palestra, 40,00 €, si ripete: puoi togliere solo questa occorrenza o tutta la serie; il conto collegato torna come prima delle voci eliminate.');
    // An instalment row without its position falls back to the series wording rather than printing «Rata undefined».
    expect(plain(describeSeriesDeleteReading({ mode: 'installment', label: 'Divano', amount: -100 }))).toContain('Divano, 100,00 €, si ripete');
  });
});

describe('describeMovementDetailReading — the reading of the detail is where its delete speaks', () => {
  // Noon, like every date fixture here: twelve hours clear of any timezone edge.
  const date = new Date(2026, 8, 14, 12);
  const deletion = { type: 'variable' as const, amount: -373.81, hasAccount: true };

  it('names the day while idle, and says a scheduled row has not happened yet', () => {
    const idle = describeMovementDetailReading({ date, scheduled: false, phase: 'idle', deletion });
    expect(plain(idle.narrative)).toBe('Movimento del 14 settembre 2026.');
    expect(idle.tone).toBe('neutral');
    const scheduled = describeMovementDetailReading({ date, scheduled: true, phase: 'idle', deletion });
    expect(plain(scheduled.narrative)).toBe('In calendario per il 14 settembre 2026: non è ancora avvenuto.');
  });

  it('gives way to the consequence, in the negative tone, while the delete is armed', () => {
    const armed = describeMovementDetailReading({ date, scheduled: false, phase: 'armed', deletion });
    expect(plain(armed.narrative)).toBe('Eliminando, il conto viene riaccreditato di 373,81 €.');
    expect(armed.tone).toBe('negative');
  });

  it('says the delete was let go instead of silently returning to the date', () => {
    const disarmed = describeMovementDetailReading({ date, scheduled: false, phase: 'disarmed', deletion });
    expect(plain(disarmed.narrative)).toBe('Eliminazione annullata. Movimento del 14 settembre 2026.');
    expect(disarmed.tone).toBe('neutral');
  });
});

describe('describeMovementsFilterReading — the filters count what is left of the period', () => {
  it('says the list is whole when no filter is set', () => {
    expect(plain(describeMovementsFilterReading({ activeFilters: 0, shown: 112, total: 112 }))).toBe('Nessun filtro attivo: la lista mostra tutti i 112 movimenti del periodo.');
    expect(plain(describeMovementsFilterReading({ activeFilters: 0, shown: 1, total: 1 }))).toBe('Nessun filtro attivo: la lista mostra l’unico movimento del periodo.');
  });

  it('counts the rows that pass, agreeing in number on both sides', () => {
    expect(plain(describeMovementsFilterReading({ activeFilters: 2, shown: 27, total: 112 }))).toBe('2 filtri attivi: restano 27 movimenti su 112.');
    expect(plain(describeMovementsFilterReading({ activeFilters: 1, shown: 1, total: 12 }))).toBe('1 filtro attivo: resta 1 movimento su 12.');
  });

  it('names an empty result and an empty period as what they are', () => {
    expect(plain(describeMovementsFilterReading({ activeFilters: 2, shown: 0, total: 112 }))).toBe('2 filtri attivi: nessun movimento su 112 li passa.');
    expect(plain(describeMovementsFilterReading({ activeFilters: 1, shown: 0, total: 112 }))).toBe('1 filtro attivo: nessun movimento su 112 lo passa.');
    // A filter set over an empty period still has nothing to narrow: the period wins.
    expect(plain(describeMovementsFilterReading({ activeFilters: 1, shown: 0, total: 0 }))).toBe('Nessun movimento nel periodo: non c’è nulla da filtrare.');
  });

  it('labels the primary with the count it shows, never «0 movimenti»', () => {
    expect(describeMovementsFilterAction(27)).toBe('Mostra 27 movimenti');
    expect(describeMovementsFilterAction(1)).toBe('Mostra 1 movimento');
    expect(describeMovementsFilterAction(0)).toBe('Torna alla lista');
  });
});

describe('describeSnapshotOverwrite — the title names the act and the month', () => {
  it('lowercases the month in the title and keeps it capitalised at the head of the reading', () => {
    const { title, reading } = describeSnapshotOverwrite({ month: 9, year: 2026 });
    expect(title).toBe('Sovrascrivi lo snapshot di settembre');
    expect(plain(reading)).toBe('Settembre 2026 ha già uno snapshot: sovrascriverlo lo sostituisce con i valori di oggi. La nota del mese resta.');
  });
});

describe('describeLinkSeriesReading — «Collega la serie a un conto»', () => {
  const first = new Date(2026, 8, 28, 12);

  it('should say how many occurrences will move the account, from when, and that the past stays', () => {
    expect(plain(describeLinkSeriesReading({ mode: 'recurring', futureCount: 3, firstDate: first, pastCount: 9, accountName: 'Conto BNL' }))).toBe(
      'Le 3 voci future, dal 28 settembre 2026, scaleranno Conto BNL ciascuna alla sua data; le 9 già avvenute restano come sono.',
    );
    expect(plain(describeLinkSeriesReading({ mode: 'installment', futureCount: 3, firstDate: first, pastCount: 0, accountName: null }))).toBe(
      'Le 3 rate future, dal 28 settembre 2026, scaleranno il conto che scegli ciascuna alla sua data.',
    );
  });

  it('should speak of the one occurrence left in the singular', () => {
    expect(plain(describeLinkSeriesReading({ mode: 'installment', futureCount: 1, firstDate: first, pastCount: 1, accountName: 'Carta' }))).toBe(
      'L’unica rata futura, il 28 settembre 2026, scalerà Carta in quel giorno; quella già avvenuta resta com’è.',
    );
  });

  it('should say there is nothing to link when no occurrence is left to come', () => {
    expect(plain(describeLinkSeriesReading({ mode: 'recurring', futureCount: 0, firstDate: null, pastCount: 12, accountName: 'Conto BNL' }))).toContain('Nessuna voce futura da collegare');
  });

  it('should speak of the principal when the series is linked to a property\'s mortgage', () => {
    expect(plain(describeLinkSeriesReading({ mode: 'recurring', futureCount: 3, firstDate: first, pastCount: 9, accountName: 'Casa', target: 'debt' }))).toBe(
      'Le 3 voci future, dal 28 settembre 2026, ridurranno il debito di Casa della loro quota capitale, ciascuna alla sua data; le 9 già avvenute restano come sono.',
    );
    expect(plain(describeLinkSeriesReading({ mode: 'installment', futureCount: 1, firstDate: first, pastCount: 0, accountName: null, target: 'debt' }))).toBe(
      'L’unica rata futura, il 28 settembre 2026, ridurrà il debito dell’immobile che scegli della sua quota capitale.',
    );
    expect(plain(describeLinkSeriesReading({ mode: 'recurring', futureCount: 0, firstDate: null, pastCount: 4, accountName: 'Casa', target: 'debt' }))).toContain('riducono già il debito di un immobile');
  });
});

describe('describeDebtRepaymentField — the line under «Riduce il debito di»', () => {
  const flat = (text: string) => text.replace(/\u00a0/g, ' ');

  it('should invite the link while no property is chosen', () => {
    expect(describeDebtRepaymentField({ propertyName: null, debt: 0, instalment: null, split: null })).toBe(
      'Se è la rata di un mutuo, scegli l’immobile: alla data della rata il suo debito scende della quota capitale.'
    );
  });

  it('should split this instalment into principal and interest on today\'s debt', () => {
    expect(flat(describeDebtRepaymentField({ propertyName: 'Casa', debt: 200_000, annualRatePct: 3.6, instalment: 1012, split: { interest: 600, principal: 412 } }))).toBe(
      'Alla data della rata il debito di Casa scende della quota capitale: sul debito di oggi 412,00 € di 1012,00 €, il resto (600,00 €) sono interessi al TAN 3,6%.'
    );
  });

  it('should name the debt and the TAN before an amount is typed', () => {
    expect(flat(describeDebtRepaymentField({ propertyName: 'Casa', debt: 182_000, annualRatePct: 3.25, instalment: null, split: null }))).toBe(
      'Alla data della rata il debito di Casa (182.000,00 €) scende della quota capitale, al TAN 3,25%.'
    );
  });

  it('should say that without a TAN the whole instalment lowers the debt', () => {
    expect(describeDebtRepaymentField({ propertyName: 'Casa', debt: 1000, instalment: 100, split: { interest: 0, principal: 100 } })).toBe(
      'Alla data della rata il debito di Casa scende dell’intera rata: l’immobile non ha un TAN (si imposta in Patrimonio).'
    );
  });
});
