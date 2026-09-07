# FIRE › Coast FIRE

> **When to open this guide** — you are touching `components/fire-simulations/CoastFireTab.tsx`, `components/fire-simulations/coast/*` (`tiles/*`, `CoastIpotesi`, `CoastDettaglio`, `CoastFireProjectionChart`), `lib/utils/coastFireView.ts` or `lib/hooks/useCoastFireSettingsDraft.ts`. The page-wide rules — the pension unlock, `respectPensionLockInFire`, the bridge model, the config-first collapse, the Ventaglio engine, `deriveMonteCarloAllocation`, the goal math — live in `doc/guide/fire.md § FIRE, What If and Goals` and are not repeated here. In `AGENTS.md` only the stub with the essentials remains (§ FIRE, What If and Goals); modules and files: `CLAUDE.md` → *Key Files* → the **Coast FIRE** entry. Fixture and specs: `scripts/seedCoastFireE2E.mts`, `e2e/coast*.spec.ts` (`coast.mobile.spec.ts` measures `main`'s overflow).

## FIRE › Coast FIRE — a verdict over tiles (`components/fire-simulations/CoastFireTab.tsx`, `components/fire-simulations/coast/*`, `lib/utils/coastFireView.ts`)

- The tab answers «posso smettere di versare?» before any number and computes nothing: `coastFireView.ts` holds BOTH
  the numbers (`summarizeCoastTarget`, `summarizeCoastScenarios`, `summarizeCoastPensions`, `buildCoastInflowEvents`,
  `resolveCoastBridgeYears`) and the words (`buildCoastVerdict`, the `describe*` readings) — one module on purpose, the
  one exception to the `*Summary`/`*Narrative` pair, because this tab CHOOSES what to show of `fireService` and one
  file is where that choice is tested. The only arithmetic in it is a ratio (liquid progress) and a difference (surplus);
  the parity test pins that every euro printed is one of the projection's own numbers.
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
- The lock is `summarizeLock(pensionLockState, { currentYear, ritaUnlockAge })` — the same `FireLock` the Calcolatore
  reads — with `ritaUnlockAge` from the SAVED settings (`resolveRitaUnlockAge(settings)`): Coast has no RITA form of its
  own. The page has NO switch: the pension lock is the Calcolatore's Base di calcolo control (`doc/guide/fire.md § FIRE › Calcolatore — a verdict over tiles`), the Ipotesi description
  names its state («fondo pensione bloccato fino al 2048») and the Dettaglio explainer says where it lives.
- **The pension clause lists EVERY pension with its start year** («dal 2052 la Pensione estera, dal 2055 la Pensione
  INPS e dal 2061 la pensione di Marco coprono insieme …»), at `totalNetAnnualPensionAtSteadyState / 12`; a label
  that starts with «Pension…» takes the article («la Pensione INPS»), any other label — a household names rows after
  the person — reads «la pensione di Giuseppe». Start years come from the decorrenza, else
  `currentYear + ceil(yearsUntilStart)` — the same rule as the Afflussi events. No pension → no clause, never
  «nessuna pensione».
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
  fixture fixes expenses but not the clock: structure and format only (AGENTS.md § Browser-Driven E2E).

## Per-page blind spots

- **FIRE › Coast FIRE**: the verdict's two capital figures are net of the locked fund and only the lock sentence says so; the pension clause reads «la Pensione INPS» for labels starting with «Pension…», «la pensione di Giuseppe» otherwise (every pension listed, never counted); `coast.spec.ts` asserts structure and format only (the fixture fixes expenses, not the clock); the Ipotesi disclosure reopens on every unsaved edit or incomplete pension row, ONE save for four tiles; the «Impatto delle pensioni» table exists from 1440 only; `buildCoastInflowEvents` merges funds unlocking in the same year.
