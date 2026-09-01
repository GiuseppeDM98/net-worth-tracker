import { describe, it, expect } from 'vitest';
import {
  armedActionLabel,
  describeAssetIntent,
  describeCategoryDeleteReading,
  describeCategoryMoveReading,
  describeDividendDayReading,
  describeDummyDataReading,
  describeExpenseIntent,
  describeModalStatus,
  describeMovementsReading,
  describeTradeIntent,
  describeWriteError,
  pluralize,
  userFacingError,
  ASSET_TYPE_PICKER_READING,
  EXPENSE_TYPE_PICKER_READING,
  type ModalStatusCopy,
} from '@/lib/utils/dialogNarrative';
import { narrativeToText, type Narrative } from '@/lib/utils/narrative';

/**
 * `Intl('it-IT')` puts a NO-BREAK space before the €, and the tests read the way the screen
 * prints — so the nbsp is flattened rather than the formatter "fixed" (AGENTS.md → Panoramica).
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
