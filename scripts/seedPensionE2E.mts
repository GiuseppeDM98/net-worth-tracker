/**
 * Deterministic Previdenza fixture for the Playwright suite.
 *
 * Run via `npm run e2e:seed` (which points the Admin SDK at the emulators — NEVER production).
 * Playwright's global setup runs it before every suite, so the E2E assertions can name exact
 * figures instead of asserting "some number is present".
 *
 * WHY A DEDICATED FIXTURE, not `emulators:seed` + `emulators:pension`
 * The base seed's fondo pensione is deliberately tracked the OLD way (an `etf` with the euro value
 * in `quantity`), because it exists to exercise the conversion path — on `/dashboard/pension` it
 * renders the empty state. `emulators:pension` does convert it, but it is an *exercise* script with
 * 30 assertions of its own: pinning UI tests to its end state would make a failure there look like
 * a UI regression here. This file builds only what the Previdenza view reads, and nothing else.
 *
 * Idempotent: deterministic `e2e-*` doc ids are overwritten on every run, and the Auth user is
 * created-or-updated. It layers ON TOP of `emulators:seed` (same `test-user-1`) without touching
 * any `seed-*` document.
 *
 * The figures below are chosen, not arbitrary — see the comment on `VALUE_SERIES`.
 *
 * SCENARI DEGRADATI (`npm run e2e:seed -- suspicious|idle|fresh`)
 * Lo scenario di default descrive un fondo che va bene: serie regolare, versamenti registrati,
 * rendimento plausibile. I rami in cui la pagina SOSTITUISCE la percentuale con una spiegazione non
 * sono raggiungibili da quei dati, ed è esattamente dove vive la logica più delicata. Gli scenari
 * degradati li producono, e vivono su un UTENTE SEPARATO: riseminare lo stesso account renderebbe
 * ogni spec dipendente dall'ordine di esecuzione, che è il modo più rapido di ottenere una suite che
 * fallisce solo in CI.
 */

import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  console.error(
    'Refusing to seed: FIRESTORE_EMULATOR_HOST is not set. Run this via `npm run e2e:seed` ' +
      '(with the emulators started via `npm run emulators`).'
  );
  process.exit(1);
}

const PROJECT_ID = process.env.GCLOUD_PROJECT || 'demo-net-worth';
const TEST_UID = 'test-user-1';
const TEST_EMAIL = 'test@example.com';
const TEST_PASSWORD = 'test1234';

const FUND_ID = 'e2e-pension-fund';
const FUND_NAME = 'Fondo Pensione E2E';
const MEMBER_ID = 'e2e-member-1';
const MEMBER_NAME = 'Marco';

/** Account separato per gli scenari degradati — vedi la nota in testa al file. */
const DEGRADED_UID = 'test-user-degraded';
const DEGRADED_EMAIL = 'degraded@example.com';
const DEGRADED_FUND_ID = 'e2e-degraded-fund';
/** L'ETF dello scenario `performance`; cancellato dal reset così gli altri scenari non lo vedono. */
const DEGRADED_ETF_ID = 'e2e-degraded-perf-etf';
const DEGRADED_ETF_NAME = 'ETF Mondo E2E';
const DEGRADED_FUND_NAME = 'Fondo Pensione Degradato';
const DEGRADED_MEMBER_ID = 'e2e-degraded-member';
const DEGRADED_MEMBER_NAME = 'Anna';

/**
 * `degraded-user` crea SOLO l'account, e gira una volta dal global setup; gli altri tre scrivono
 * SOLO dati.
 *
 * La separazione non è cosmetica: `auth.updateUser(uid, { password })` revoca i refresh token
 * esistenti, quindi riseminare l'utente a ogni scenario buttava fuori la sessione parcheggiata da
 * `auth.degraded.setup.ts` e ogni test degradato finiva sulla pagina di login.
 */
type Scenario = 'default' | 'degraded-user' | 'performance' | DataScenario;

/** Gli scenari che scrivono dati previdenziali, cioè tutti tranne i due che gestiscono un account. */
type DataScenario = 'suspicious' | 'idle' | 'fresh';

/**
 * Lo scenario di Rendimenti: il fondo pensione DENTRO la base misurata, con un ETF accanto.
 *
 * Scritto sull'account degradato per lo stesso motivo degli altri scenari — l'account base porta le
 * spese del mese corrente e i suoi snapshot dipendono dal mese di esecuzione, mentre qui ogni cifra
 * deve essere esatta: `e2e/performance.degraded.spec.ts` afferma gli euro dell'attribuzione.
 *
 * Le proprietà che reggono le asserzioni:
 *  - l'ETF rende +2%, +1,5% e +2% (100 quote, prezzo 100 → 102 → 103,53 → 105,60): +560 € di effetto
 *    prezzo in tre mesi, e nessun altro movimento nella base con il toggle OFF — tre rendimenti NON
 *    identici, o la volatilità è zero e lo Sharpe stampa un numero a quindici cifre;
 *  - il fondo porta `allocationRole: 'excluded'` di proposito — è il ruolo naturale di un capitale
 *    bloccato ed è ciò che rendeva il toggle un no-op prima del 2026-09-06: il toggle deve vincere;
 *  - l'unico versamento (TFR 900 €) è datato 30/06 ma registrato il 5/07: la finestra tracciata parte
 *    da giugno (data contabile), il fondo entra nella base con lo snapshot di giugno (20.100 €) e il
 *    salto di luglio è 900 di versamento + 100 di mercato, agosto +100 di solo mercato;
 *  - nessuna spesa: i cash flow del cashflow sono 0 e il canale pensione è l'unico flusso.
 */
const PERFORMANCE_SERIES: Array<{ month: number; etfPrice: number; fund: number }> = [
  { month: 5, etfPrice: 100, fund: 20_000 },
  { month: 6, etfPrice: 102, fund: 20_100 },
  { month: 7, etfPrice: 103.53, fund: 21_100 },
  { month: 8, etfPrice: 105.6, fund: 21_200 },
];
const PERFORMANCE_ETF_QUANTITY = 100;
/** Dated 30 June, recorded 5 July (month indexes are 0-based); the Dates are built where CURRENT_YEAR is in scope. */
const PERFORMANCE_CONTRIBUTION = { id: 'e2e-degraded-perf-tfr', amount: 900, dateMonthIndex: 5, dateDay: 30, createdMonthIndex: 6, createdDay: 5 };

/**
 * I tre stati in cui la pagina rifiuta di mostrare una percentuale, ciascuno costruito dal suo
 * requisito in `lib/utils/pensionReturn.ts` — non da numeri scelti a occhio.
 */
const DEGRADED_SCENARIOS: Record<
  DataScenario,
  { description: string; values: [month: number, value: number][] }
> = {
  // `isCoverageSuspicious`: >20% annualizzato con ZERO versamenti registrati. Crescita del 10% al
  // mese per quattro mesi — nessun comparto fa così, sono versamenti non registrati.
  suspicious: {
    description: 'crescita inspiegata: il rendimento va dichiarato inattendibile',
    values: [
      [1, 10_000],
      [2, 11_000],
      [3, 12_000],
      [4, 13_000],
    ],
  },
  // `hasNoMovement`: due mesi allo stesso valore e nessun versamento. Il TWR vale 0 per ASSENZA di
  // dati, e «+0,00%» sarebbe una misura inventata.
  idle: {
    description: 'finestra aperta ma ferma: non c’è ancora niente da misurare',
    values: [
      [7, 29_800],
      [8, 29_800],
    ],
  },
  // Serie vuota: il fondo esiste ma nessuno snapshot lo contiene ancora — lo stato di ogni fondo
  // appena creato, finché il cron serale non scrive la prima fotografia che lo include.
  fresh: {
    description: 'fondo appena creato: nessuna fotografia mensile lo contiene ancora',
    values: [],
  },
};

/** The tax years the year axis must offer: the current one plus one older. */
export const CURRENT_YEAR = 2026;
export const PREVIOUS_YEAR = 2025;

/**
 * Monthly fund values, consecutive months so the annualisation is honest (`computePensionReturn`
 * annualises with `12 / monthsCovered`, which assumes monthly points).
 *
 * Two properties are load-bearing for the assertions:
 *  - July's jump is EXACTLY the 821,01 € of contributions recorded that month, so the TWR neutralises
 *    it and the "Guadagno di mercato" excludes it;
 *  - the resulting annualised return stays well under `SUSPICIOUS_ANNUAL_RETURN` (20%), so the card
 *    shows a percentage instead of the coverage warning, and well clear of `hasNoMovement`.
 */
const VALUE_SERIES: [month: number, value: number][] = [
  [1, 28_000],
  [2, 28_150],
  [3, 28_300],
  [4, 28_500],
  [5, 28_650],
  [6, 28_800],
  [7, 29_621.01],
  [8, 29_800],
];

const FUND_VALUE = VALUE_SERIES[VALUE_SERIES.length - 1][1];

/**
 * Contributions. The three June ones are dated 30/06 but RECORDED in July — the real shape that
 * `valueEffectMonth` exists for, and the one that makes July's value jump attributable to
 * contributions rather than to the market.
 */
const CONTRIBUTIONS = [
  {
    id: 'e2e-contrib-2025-voluntary',
    source: 'voluntary',
    amount: 1_000,
    date: new Date(PREVIOUS_YEAR, 10, 15),
    createdAt: new Date(PREVIOUS_YEAR, 10, 15),
    taxYear: PREVIOUS_YEAR,
  },
  {
    id: 'e2e-contrib-2026-tfr',
    source: 'tfr',
    amount: 534.88,
    date: new Date(CURRENT_YEAR, 5, 30),
    createdAt: new Date(CURRENT_YEAR, 6, 5),
    taxYear: CURRENT_YEAR,
  },
  {
    id: 'e2e-contrib-2026-employer',
    source: 'employer',
    amount: 134.11,
    date: new Date(CURRENT_YEAR, 5, 30),
    createdAt: new Date(CURRENT_YEAR, 6, 5),
    taxYear: CURRENT_YEAR,
  },
  {
    id: 'e2e-contrib-2026-voluntary',
    source: 'voluntary',
    amount: 152.02,
    date: new Date(CURRENT_YEAR, 5, 30),
    createdAt: new Date(CURRENT_YEAR, 6, 5),
    taxYear: CURRENT_YEAR,
  },
] as const;

const app = getApps()[0] ?? initializeApp({ projectId: PROJECT_ID });
const db = getFirestore(app);
const auth = getAuth(app);
const now = new Date();

async function seedAuthUser(uid: string, email: string): Promise<void> {
  try {
    await auth.createUser({ uid, email, password: TEST_PASSWORD });
  } catch (error: unknown) {
    const code = (error as { code?: string }).code;
    if (code !== 'auth/uid-already-exists' && code !== 'auth/email-already-exists') throw error;
    await auth.updateUser(uid, { email, password: TEST_PASSWORD });
  }
  console.info(`  ✓ Auth user ${email}`);
}

/**
 * A `pensionFund` is manually valued, and its euro value lives in `quantity` AT PRICE 1 — exactly
 * like a cash balance (see the VALUE EFFECT note in `pensionContributionService.ts`). `AssetDialog`
 * builds it the same way: the field labelled "Valore attuale" writes `quantity`, and `currentPrice`
 * stays at its default of 1.
 *
 * Inverting the two (quantity 1 at price 29.800) still renders the right total through
 * `calculateAssetValue`, so it looks correct until the first contribution — which adds its amount to
 * `quantity`, turning 1 into 201 and the displayed value into 5.989.800 €.
 */
async function seedFund(): Promise<void> {
  await db.collection('assets').doc(FUND_ID).set({
    userId: TEST_UID,
    name: FUND_NAME,
    ticker: '',
    type: 'pensionFund',
    assetClass: 'equity',
    quantity: FUND_VALUE,
    currentPrice: 1,
    currency: 'EUR',
    isLiquid: false,
    allocationRole: 'frozen',
    pensionFundDetails: { familyMemberId: MEMBER_ID },
    lastPriceUpdate: now,
    createdAt: now,
    updatedAt: now,
  });
  console.info(`  ✓ ${FUND_NAME} (${FUND_VALUE} €)`);
}

/**
 * Merged, not overwritten: the base seed owns `targets`/`laborIncomeCategoryIds` in this same
 * document and the Previdenza fixture must not wipe them.
 *
 * `pensionReturnStartMonth` is deliberately left unset — the window then starts at the first
 * recorded contribution, which is the default path most users are on.
 */
async function seedFamilyMember(): Promise<void> {
  await db
    .collection('assetAllocationTargets')
    .doc(TEST_UID)
    .set(
      {
        userId: TEST_UID,
        familyMembers: [
          {
            id: MEMBER_ID,
            name: MEMBER_NAME,
            grossAnnualIncome: 35_000,
            isFirstEmploymentPost2007: true,
            firstEmploymentYear: 2015,
          },
        ],
      },
      { merge: true }
    );
  console.info(`  ✓ family member ${MEMBER_NAME} (RAL 35.000 €)`);
}

async function seedContributions(): Promise<void> {
  await Promise.all(
    CONTRIBUTIONS.map((contribution) =>
      db.collection('pensionContributions').doc(contribution.id).set({
        userId: TEST_UID,
        assetId: FUND_ID,
        source: contribution.source,
        amount: contribution.amount,
        date: contribution.date,
        taxYear: contribution.taxYear,
        deductible: contribution.source !== 'tfr',
        createdAt: contribution.createdAt,
      })
    )
  );
  console.info(`  ✓ ${CONTRIBUTIONS.length} contributions across ${PREVIOUS_YEAR}/${CURRENT_YEAR}`);
}

/**
 * One snapshot per month carrying the fund in `byAsset` — the only place the fund's value is frozen
 * month by month, and therefore the only input `buildPensionValueSeries` can read.
 *
 * `merge: true` for the same reason as the settings doc: the base seed writes its own snapshot for
 * the current month and this fixture only needs to contribute the fund's `byAsset` entry.
 */
async function seedSnapshots(): Promise<void> {
  await Promise.all(
    VALUE_SERIES.map(([month, value]) =>
      db
        .collection('monthly-snapshots')
        .doc(`${TEST_UID}-${CURRENT_YEAR}-${month}`)
        .set(
          {
            userId: TEST_UID,
            year: CURRENT_YEAR,
            month,
            totalNetWorth: value,
            liquidNetWorth: 0,
            illiquidNetWorth: value,
            byAssetClass: { equity: value },
            byAsset: [
              {
                assetId: FUND_ID,
                ticker: '',
                name: FUND_NAME,
                quantity: value,
                price: 1,
                totalValue: value,
              },
            ],
            assetAllocation: {},
            createdAt: new Date(CURRENT_YEAR, month - 1, 28),
          },
          { merge: true }
        )
    )
  );
  console.info(`  ✓ ${VALUE_SERIES.length} monthly snapshots with the fund in byAsset`);
}

/**
 * Azzera i dati previdenziali dell'account degradato prima di riscriverli.
 *
 * Serve perché gli scenari usano MESI DIVERSI: senza la cancellazione, gli snapshot di `suspicious`
 * (gennaio-aprile) resterebbero accanto a quelli di `idle` (luglio-agosto) e la serie risultante non
 * sarebbe nessuno dei due. Il fondo e il membro no: hanno id deterministici e vengono sovrascritti.
 */
async function resetDegradedData(): Promise<void> {
  const [snapshots, contributions] = await Promise.all([
    db.collection('monthly-snapshots').where('userId', '==', DEGRADED_UID).get(),
    db.collection('pensionContributions').where('userId', '==', DEGRADED_UID).get(),
  ]);

  const batch = db.batch();
  for (const doc of [...snapshots.docs, ...contributions.docs]) batch.delete(doc.ref);
  // The performance scenario's ETF must not survive into a Previdenza scenario (a delete of a
  // missing document is a no-op).
  batch.delete(db.collection('assets').doc(DEGRADED_ETF_ID));
  batch.delete(db.collection('performance-cache').doc(DEGRADED_UID));
  await batch.commit();

  console.info(`  ✓ reset (${snapshots.size} snapshot, ${contributions.size} versamenti rimossi)`);
}

async function seedDegradedScenario(scenario: DataScenario): Promise<void> {
  const { description, values } = DEGRADED_SCENARIOS[scenario];
  const fundValue = values.length > 0 ? values[values.length - 1][1] : 5_000;

  // Nessun tocco all'account: vedi la nota su `Scenario`.
  await resetDegradedData();

  await db.collection('assets').doc(DEGRADED_FUND_ID).set({
    userId: DEGRADED_UID,
    name: DEGRADED_FUND_NAME,
    ticker: '',
    type: 'pensionFund',
    assetClass: 'equity',
    quantity: fundValue,
    currentPrice: 1,
    currency: 'EUR',
    isLiquid: false,
    allocationRole: 'frozen',
    pensionFundDetails: { familyMemberId: DEGRADED_MEMBER_ID },
    lastPriceUpdate: now,
    createdAt: now,
    updatedAt: now,
  });

  await db
    .collection('assetAllocationTargets')
    .doc(DEGRADED_UID)
    .set(
      {
        userId: DEGRADED_UID,
        familyMembers: [
          {
            id: DEGRADED_MEMBER_ID,
            name: DEGRADED_MEMBER_NAME,
            grossAnnualIncome: 35_000,
            isFirstEmploymentPost2007: true,
            firstEmploymentYear: 2015,
          },
        ],
      },
      { merge: true }
    );

  await Promise.all(
    values.map(([month, value]) =>
      db
        .collection('monthly-snapshots')
        .doc(`${DEGRADED_UID}-${CURRENT_YEAR}-${month}`)
        .set({
          userId: DEGRADED_UID,
          year: CURRENT_YEAR,
          month,
          totalNetWorth: value,
          liquidNetWorth: 0,
          illiquidNetWorth: value,
          byAssetClass: { equity: value },
          byAsset: [
            {
              assetId: DEGRADED_FUND_ID,
              ticker: '',
              name: DEGRADED_FUND_NAME,
              quantity: value,
              price: 1,
              totalValue: value,
            },
          ],
          assetAllocation: {},
          createdAt: new Date(CURRENT_YEAR, month - 1, 28),
        })
    )
  );

  console.info(`  ✓ ${DEGRADED_FUND_NAME} (${fundValue} €), ${values.length} snapshot`);
  console.info(`  → scenario «${scenario}»: ${description}`);
}

/**
 * Lo scenario di Rendimenti (vedi `PERFORMANCE_SERIES`): fondo `excluded` + ETF, quattro snapshot con
 * entrambi in `byAsset`, un TFR, il toggle «Includi i fondi pensione» OFF (la spec lo accende via REST
 * e lo rimette OFF).
 */
async function seedPerformanceScenario(): Promise<void> {
  await resetDegradedData();
  const last = PERFORMANCE_SERIES[PERFORMANCE_SERIES.length - 1];
  const base = { userId: DEGRADED_UID, currency: 'EUR', lastPriceUpdate: now, createdAt: now, updatedAt: now };

  await Promise.all([
    db.collection('assets').doc(DEGRADED_FUND_ID).set({
      ...base,
      name: DEGRADED_FUND_NAME,
      ticker: '',
      type: 'pensionFund',
      assetClass: 'equity',
      quantity: last.fund,
      currentPrice: 1,
      isLiquid: false,
      allocationRole: 'excluded',
      pensionFundDetails: { familyMemberId: DEGRADED_MEMBER_ID },
    }),
    db.collection('assets').doc(DEGRADED_ETF_ID).set({
      ...base,
      name: DEGRADED_ETF_NAME,
      ticker: 'E2EW',
      type: 'etf',
      assetClass: 'equity',
      quantity: PERFORMANCE_ETF_QUANTITY,
      currentPrice: last.etfPrice,
      isLiquid: true,
      allocationRole: 'tradable',
    }),
    db.collection('assetAllocationTargets').doc(DEGRADED_UID).set(
      {
        userId: DEGRADED_UID,
        performanceIncludesPensionFunds: false,
        performanceIncludesExcludedAssets: false,
        familyMembers: [
          { id: DEGRADED_MEMBER_ID, name: DEGRADED_MEMBER_NAME, grossAnnualIncome: 35_000, isFirstEmploymentPost2007: true, firstEmploymentYear: 2015 },
        ],
      },
      { merge: true }
    ),
    db.collection('pensionContributions').doc(PERFORMANCE_CONTRIBUTION.id).set({
      userId: DEGRADED_UID,
      assetId: DEGRADED_FUND_ID,
      source: 'tfr',
      amount: PERFORMANCE_CONTRIBUTION.amount,
      date: new Date(CURRENT_YEAR, PERFORMANCE_CONTRIBUTION.dateMonthIndex, PERFORMANCE_CONTRIBUTION.dateDay),
      taxYear: CURRENT_YEAR,
      deductible: false,
      createdAt: new Date(CURRENT_YEAR, PERFORMANCE_CONTRIBUTION.createdMonthIndex, PERFORMANCE_CONTRIBUTION.createdDay),
    }),
    ...PERFORMANCE_SERIES.map(({ month, etfPrice, fund }) => {
      const etf = PERFORMANCE_ETF_QUANTITY * etfPrice;
      return db
        .collection('monthly-snapshots')
        .doc(`${DEGRADED_UID}-${CURRENT_YEAR}-${month}`)
        .set({
          userId: DEGRADED_UID,
          year: CURRENT_YEAR,
          month,
          totalNetWorth: etf + fund,
          liquidNetWorth: etf,
          illiquidNetWorth: fund,
          byAssetClass: { equity: etf + fund },
          byAsset: [
            { assetId: DEGRADED_ETF_ID, ticker: 'E2EW', name: DEGRADED_ETF_NAME, quantity: PERFORMANCE_ETF_QUANTITY, price: etfPrice, totalValue: etf },
            { assetId: DEGRADED_FUND_ID, ticker: '', name: DEGRADED_FUND_NAME, quantity: fund, price: 1, totalValue: fund },
          ],
          assetAllocation: {},
          createdAt: new Date(CURRENT_YEAR, month - 1, 28),
        });
    }),
  ]);

  console.info(`  ✓ ${DEGRADED_ETF_NAME} + ${DEGRADED_FUND_NAME} (excluded), ${PERFORMANCE_SERIES.length} snapshot, 1 TFR`);
  console.info('  → scenario «performance»: il fondo pensione dentro la base di Rendimenti, da giugno');
}

async function main(): Promise<void> {
  const scenario = (process.argv[2] ?? 'default') as Scenario;

  if (scenario === 'performance') {
    console.info(`\nSeeding scenario «performance» into ${PROJECT_ID} (emulator)…\n`);
    await seedPerformanceScenario();
    console.info('\nDone.\n');
    return;
  }

  if (scenario === 'degraded-user') {
    console.info(`\nCreating the degraded-scenario account in ${PROJECT_ID} (emulator)…\n`);
    await seedAuthUser(DEGRADED_UID, DEGRADED_EMAIL);
    console.info('\nDone.\n');
    return;
  }

  if (scenario !== 'default') {
    if (!(scenario in DEGRADED_SCENARIOS)) {
      console.error(
        `Scenario sconosciuto: «${scenario}». Attesi: ${[...Object.keys(DEGRADED_SCENARIOS), 'performance'].join(', ')}.`
      );
      process.exit(1);
    }
    console.info(`\nSeeding scenario «${scenario}» into ${PROJECT_ID} (emulator)…\n`);
    await seedDegradedScenario(scenario);
    console.info('\nDone.\n');
    return;
  }

  console.info(`\nSeeding Previdenza E2E fixture into ${PROJECT_ID} (emulator)…\n`);
  await seedAuthUser(TEST_UID, TEST_EMAIL);
  await seedFund();
  await seedFamilyMember();
  await seedContributions();
  await seedSnapshots();
  console.info('\nDone.\n');
}

main().catch((error) => {
  console.error('Pension E2E seed failed:', error);
  process.exit(1);
});
