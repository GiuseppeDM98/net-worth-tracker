# FIRE › Coast FIRE

> **When to open this guide** — you are touching `components/fire-simulations/CoastFireTab.tsx`, `components/fire-simulations/coast/*` (`tiles/*`, `CoastIpotesi`, `CoastDettaglio`, `CoastFireProjectionChart`), `lib/utils/coastFireView.ts` or `lib/hooks/useCoastFireSettingsDraft.ts`. The page-wide rules — the pension unlock, `respectPensionLockInFire`, the bridge model, the config-first collapse, the Ventaglio engine, `deriveMonteCarloAllocation`, the goal math — live in `doc/guide/fire.md § FIRE, What If and Goals` and are not repeated here. In `AGENTS.md` only the stub with the essentials remains (§ FIRE, What If and Goals); modules and files: `doc/guide/fire.md` § *Files*. Fixture and specs: `scripts/seedCoastFireE2E.mts`, `e2e/coast*.spec.ts` (`coast.mobile.spec.ts` measures `main`'s overflow).

## FIRE › Coast FIRE — a verdict over tiles (`components/fire-simulations/CoastFireTab.tsx`, `components/fire-simulations/coast/*`, `lib/utils/coastFireView.ts`)

- The tab answers «posso smettere di versare?» before any number and computes nothing: `coastFireView.ts` holds BOTH
  the numbers (`summarizeCoastTarget`, `summarizeCoastScenarios`, `summarizeCoastPensions`, `buildCoastInflowEvents`,
  `resolveCoastBridgeYears`, `resolveCoastPace`) and the words (`buildCoastVerdict`, the `describe*` readings) — one
  module on purpose, the one exception to the `*Summary`/`*Narrative` pair, because this tab CHOOSES what to show of
  `fireService` and one file is where that choice is tested. The arithmetic in it is a ratio (liquid progress), a
  difference (surplus) and the savings pace below; the parity test pins that every euro printed is one of the
  projection's own numbers (the savings figure included).
- **«Non ancora» has a «quando»** (2026-09-23, the tab's first critique): `resolveCoastPace(projectionData, annualSavings,
  realReturnRate, reached)` adds the Calcolatore's savings — `getAnnualCashflowData().annualSavings`, read through the
  SAME query key `['annualCashflowData', ownerId]`, kept constant in today's euro — to the projection's OWN base series
  and names the first year the sum clears the Coast number of THAT year, `fireNumberTarget(t) / (1+r)^(Y−t)` (the
  plotted target already steps with the fund, so the curve does too). From that year the series coasts and lands on
  the requirement at the target age by construction — that is the dotted line in the base slot on the chart, with a
  vertical marker at the year, and the footer's «Linea punteggiata: …». The verdict says «Al ritmo attuale, 12.000 €
  l'anno di risparmio, lo raggiungi nel 2031, a 40 anni», or «… non lo raggiungi prima dei 60 anni»; with no savings
  recorded the clause, the series and the marker are ABSENT (never «0 € l'anno»), and a reached target has no pace. A
  failed read of the savings fails the tab like the other three queries: the reader never rejects into zeros.
- **The state pensions are the Afflussi tile's, not the verdict's** (2026-09-23): the verdict used to list every
  pension at «1093 € al mese» and the Afflussi reading listed the same ones at «13.114 € netti l'anno» 100 px below;
  one list, one unit (annual), where the years are. The verdict keeps the gap, the walk to the target age, the pace
  and the lock sentence — the last one stays because the two capital figures are net of the fund and something on the
  same line has to say so.
- **The «nothing recorded» state keeps the three tiles** (2026-09-23, `resolveCoastEmptyKind` → `describeCoastEmptyTiles`):
  every tile keeps its eyebrow and says why it cannot answer, and ONLY the Traguardo carries the action — a link to
  Patrimonio without a positive net worth, else a BUTTON that opens the Ipotesi on the field that owns the missing
  input (`fieldId`: the custom-expenses switch, the current age, the target age) and focuses it. Pinned by
  `e2e/coast.degraded.spec.ts` (structure only: which action it is depends on the account's assets and saved age).
- **`useCoastFireSettingsDraft` takes ONE id, `ownerId`, and writes under it** (2026-09-23). Until then the hook took
  the viewer's uid as the write target and the owner's as the cache key: on a shared account a co-owner's «Salva
  ipotesi» wrote a copy of the owner's settings on the co-owner's OWN document, invalidated the owner's, re-read it
  untouched and reported success — the one FIRE tab the 2026-08-25 sweep (doc/guide/fire.md) had missed. Proved on the
  emulators with a grant and a second identity (owner's doc changed, viewer's absent; red with `user.uid`, green with
  `ownerId`); a failed save speaks `describeWriteError`.
- **The chart is the Calcolatore's** (2026-09-23): `SeriesLegend` under the plot (Recharts' `<Legend>` measured 3,11 ·
  3,18 · 3,77:1), scenario SLOTS and an `aria-label` with no hue, the target in neutral ink dashed, whole euros in the
  tooltip, `aria-valuetext` on the progressbar, and the hero LANDS on its first value (`SettledValue` →
  `landFirstValue`): a count from «0 €» under a track already at 40,8% was two readings of one figure. The two tile
  footers are ONE line with the method behind «Come si calcola» (`COAST_INFLOWS_METHOD`, `COAST_SCENARIOS_METHOD`).
- **The Ipotesi are two columns at natural height** (Profilo + Modello 5 | Pensioni + Scaglioni 7; `contents` wrappers
  and `order-*` below `desktop:`): paired by rows, Pensioni stretched 127 px beside Profilo and Modello 251 px beside
  Scaglioni, measured. Every control is `h-11 desktop:h-9`; the two ages say an out-of-range value AT the field
  (`aria-invalid`, the help line in `text-destructive`) before the toast repeats it on «Salva ipotesi».
- **The target line of the projection steps WITH the fund** (`fireService.calculateCoastFIREProjection`, 2026-08-25):
  `retirementCapitalRequired` is already net of the fund (the walk subtracts it valued at retirement —
  `amountToday × (1+r)^yearsToRetirement`, whether it unlocks before or after the target age), so `fireNumberTarget`
  is that net figure until the unlock and the gross one (net + the unlocked funds grown to retirement) from it. Before
  the fix the flat net line beside a stepped series showed the portfolio crossing the target with 24% of the Coast
  number still missing. A fund unlocking after the target age is never on the plot and never added. Pinned by tests.
- **The verdict's two capital figures are net of the fund** (`futureValueAtRetirementWithoutNewContributions` grows the
  FREE capital; `retirementCapitalRequired` is net of the fund's re-entry) and the lock sentence says so — «I 31.400 € nel
  fondo pensione sono esclusi da queste cifre perché restano bloccati fino al 2045; il calcolo li conta da quell'anno
  in poi». The Traguardo footer names the gross line («472.977 € con il fondo
  pensione dentro») only when the unlock is on the plot; an unlock past the target age is said as such.
- **The tax on withdrawals is in the Coast number too** (2026-09-24, `calculateCoastFIREProjection(…, withdrawalTax)` →
  `calculateCoastFIREMetrics` and the needs' `portfolioNeedMultiplier`, doc/guide/fire.md § the tax rule): each scenario reads the
  gain share on the capital grown to the target at its OWN real return — a coaster adds no basis — so the required capital at the target
  is `max(E − P, 0) / (1 − g·τ)` per year and at steady state, and the Coast number today discounts it as before. The tab reads the same
  profile as the Calcolatore (FIRE-eligible assets minus the locked funds) and the Ipotesi line declares it («tasse sui prelievi comprese
  (26% sulla plusvalenza)» / «non stimate (nessun PMC in euro)», `withdrawalTaxRate` on `CoastBasisInput`; a caller that passes nothing
  prints the line of before). Without a profile the walk is byte-identical (multiplier 1).
- The lock is `summarizeLock(pensionLockState, { currentYear, ritaUnlockAge })` — the same `FireLock` the Calcolatore
  reads — with `ritaUnlockAge` from the SAVED settings (`resolveRitaUnlockAge(settings)`): Coast has no RITA form of its
  own. The page has NO switch: the pension lock is the Calcolatore's Base di calcolo control (`doc/guide/fire.md § FIRE › Calcolatore — a verdict over tiles`), the Ipotesi description
  names its state («fondo pensione bloccato fino al 2048») and the Dettaglio explainer says where it lives.
- **The Afflussi reading lists EVERY pension with its start year** («poi dal 2052 la Pensione estera, dal 2055 la
  Pensione INPS e dal 2061 la pensione di Marco coprono insieme … netti l'anno»), at
  `totalNetAnnualPensionAtSteadyState` (annual, the tile's unit; the verdict carried the same list per month until
  2026-09-23); a label that starts with «Pension…» takes the article («la Pensione INPS»), any other label — a household
  names rows after the person — reads «la pensione di Giuseppe». Start years come from the decorrenza, else
  `currentYear + ceil(yearsUntilStart)` — the same rule as the Afflussi events. No pension → the reading says what
  that means for the number, never «nessuna pensione».
- The Ipotesi disclosure has ONE «Salva ipotesi» (in the Profilo tile) for its four tiles: the form is one document and
  `useCoastFireSettingsDraft` has one mutation. Config-first via the `useRef` seeded flag set INSIDE a `setTimeout(0)`
  (StrictMode clears the first timer), open only while no age is saved, reopening on an unsaved edit or an
  `incomplete` pension state; never auto-closed. The pension issues render as lines under the tile's reading (warning
  tone for the incomplete ones), not as a banner.
- The «Impatto delle pensioni» table is `hidden desktop:block`; below `desktop:` the same rows are a flat list — five
  columns at 350px pushed the tile past the phone's edge (caught by `coast.mobile.spec.ts`, which measures `main`'s
  offenders like `fire.mobile.spec.ts`).
- Playwright locates the tiles by `role=region` + `aria-label` («Traguardo Coast FIRE», «Afflussi già considerati»,
  «Scenari Coast FIRE»), the verdict by «Verdetto sul Coast FIRE», the disclosures by their VISIBLE text (`/^Ipotesi/`,
  `/^Dettaglio/` — the Ipotesi trigger carries the basis line, so it can be asserted closed), the hero as
  `p:has-text("numero Coast FIRE") + span`, the scenario list by `role=list` «Numero Coast FIRE per scenario». The
  fixture fixes expenses but not the clock: structure and format only (doc/guide/e2e-emulatori.md § Browser-Driven E2E (Playwright)).
  The base seed records little income, so on the fixture the pace clause reads «non lo raggiungi prima dei 60 anni»
  and the chart draws no marker — the spec accepts both phrasings.

## Per-page blind spots

- **FIRE › Coast FIRE**: the verdict's two capital figures are net of the locked fund and only the lock sentence says so; the pace is the Calcolatore's savings kept constant in today's euro (the Calcolatore adds them nominally, so the two tabs' years can differ by one), and «non lo raggiungi prima dei 60 anni» means the pace does not cross the moving Coast number before the target, not that the target is unreachable; the pension list reads «la Pensione INPS» for labels starting with «Pension…», «la pensione di Giuseppe» otherwise (every pension listed, never counted) and lives in the Afflussi reading only; `coast.spec.ts` asserts structure and format only (the fixture fixes expenses, not the clock); the Ipotesi disclosure reopens on every unsaved edit or incomplete pension row, ONE save for four tiles; the «Impatto delle pensioni» table exists from 1440 only; `buildCoastInflowEvents` merges funds unlocking in the same year; the pension-lock switch is named in prose («nella Base di calcolo del Calcolatore») and not linked, because the active tab is the page's local state, not a URL; the lock is declared wherever a figure depends on it (verdict, Traguardo footer, Afflussi, Ipotesi trigger, Patrimonio FIRE row, Come leggere) — six places by design, not by accident; «Al target e a regime» ends 68 px above its neighbour's footer beside Fasi di copertura (measured 2026-09-23, left).
