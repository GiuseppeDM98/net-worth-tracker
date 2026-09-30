# Cashflow › Divisione

> **Quando aprire questa guida** — chi tocca `components/cashflow/ExpenseSplitTab.tsx`, `lib/utils/{expenseSplitSummary,expenseSplitNarrative}.ts` o la sezione email in `lib/server/monthlyEmailService.ts`. In `AGENTS.md` resta lo stub con l'essenziale; qui c'è la regola completa. Moduli e file: § *Files*, sotto.

## Files

Moved here from `CLAUDE.md` → *Key Files* on 2026-09-19.

- **Cashflow › Divisione**: Divisione `components/cashflow/ExpenseSplitTab.tsx`, pure `lib/utils/{expenseSplitSummary,expenseSplitNarrative}.ts` (`resolveSplitBasis`, `allocateByShare`, `CommonSpending.toSplit`/`surplus`, `describeBasisRemedy`, `describeMemberCalendar`, `describeCommonIncome`, `describeIncomeConsumed`)
- **Browser**: `e2e/cashflow.split{,.mobile}.spec.ts` on its own account, fixture `scripts/seedSplitE2E.mts` (`npm run e2e:seed:split`), session `e2e/auth.split.setup.ts`, progetti `split` e `split-mobile`
- **Suites to run after a change here — Cashflow › Divisione** (moved from `AGENTS.md` § Commands on 2026-09-30): `expenseSplitSummary`, `expenseSplitNarrative` (+ `cashflowNarrative` for the scheduled clause, `settingsRoundTrip` for the flag) · **Browser** `e2e/cashflow.split{,.mobile}.spec.ts` (own account, `npm run e2e:seed:split`)

## Cashflow › Divisione (`components/cashflow/ExpenseSplitTab.tsx`, `lib/utils/{expenseSplitSummary,expenseSplitNarrative}.ts`)
- **Opt-in, like Centri di Costo** (`expenseSplitEnabled`), on **Tracciamento's period axis** — a division is a fact of a
  month the way a month's savings are. The tab computes nothing: numbers from `expenseSplitSummary.ts`, words from
  `expenseSplitNarrative.ts`, and the monthly email reads the SAME two modules, so the page and the email can never
  print two different splits.
- **ONE field carries the whole feature**: `Expense.personalMemberId`. **Absent (or `null`) MEANS «in comune»** — that
  default is why there is no migration (every row ever written is already shared) and why the normal case costs no
  interaction. A value is a `FamilyMember` id, the SAME people as Previdenza's RAL: never a second list of names.
  It applies to `income` too, and that is where the shares come from.
- **Deliberately NOT denormalized to a name**, unlike `costCenterName`: the members live in the settings document every
  consumer already loads, so a rename costs no bulk update. The price is that every reader resolves the label itself.
  The readers outside this tab are two, both in `lib/utils/movementsOwnerFilter.ts` (2026-09-11): Tracciamento's
  «Intestatario» list filter and the owner chip on an attributed row (feed, table, detail drawer) — same contract,
  blank = in comune, a lost owner = `SPLIT_UNASSIGNED_LABEL`. doc/guide/cashflow-tracciamento.md.
- **The share is NEVER invented.** `resolveSplitBasis` returns `unavailable` — with `missingNames` — when fewer than two
  people exist or when **one person has no income attributed in the period** (`missing-income`); every split-dependent
  figure (`share`, `commonShare`, `remaining`) is then `null` and the sentences name the missing input. Without that
  guard the person who DID record an income silently carries 100% of the pool. Own spending survives an unavailable
  basis — it is a fact whatever the shares do.
- **The base is the PERIOD's attributed income, WHATEVER its category** (owner's decision, 2026-09-27, replacing the
  labor-only base of 2026-08-31): a refund or a gift attributed to a person is in their share exactly as their salary
  is, `laborIncomeCategoryIds` is no longer read here (the seed still writes it for the other features), and every
  sentence says «entrate», never «stipendio». Not the RAL and not a trailing window: it is the most faithful reading of
  «this month» and the most volatile one. Do not «stabilise» it without saying so on screen — the honesty of the
  feature is that the reading names its base out loud.
- **`allocateByShare` charges the rounding residual to the LARGEST share**, so the parts sum back to the pool exactly,
  and **re-rounds after the correction** (`50.02 + (−0.01)` is `50.010000000000005` in binary floating point).
  **TRAP FOR ITS TEST: with exactly TWO shares the roundings always cancel, so the correction is unreachable in the
  two-person case this feature was built for.** A fixture on two people is green with the whole branch disabled — it
  happened, and only a falsification caught it. Test it on three.
- **A row whose member was deleted is its own bucket** (`SPLIT_UNASSIGNED_LABEL`), never folded back into the pool:
  charging everyone for a row its owner marked personal is a worse answer than admitting the row lost its owner. The
  reading declares those euros, so the parts still add up to the whole.
- **Transfers are skipped whole** — net-zero, and the money one person moves to a joint account is plumbing, not a cost.
  The control is hidden on `transfer` in the dialog for the same reason. Classification is by `type`, never by sign.
- **There is NO reconciliation of who paid**, by design: the question is «quanto resta a ciascuno», not «chi deve a
  chi», so `linkedCashAssetId` is never read. Adding it is a new feature, not a completion of this one.
- **The dialog control is in the MAIN body, not behind «Impostazioni avanzate»** (where the cost centre sits): it is
  touched on most rows. It is **native radios**, not `SegmentedPill` — this picks a VALUE, not a panel, so `role=radio`
  is what a screen reader should meet. Corollary for Playwright: step 1 of the create dialog is ALSO a radiogroup
  («Tipo di voce»), so «no radios in the dialog» is not a valid assertion — name the control.
- **Writing it is a FOUR-place fan-out**: the three creators in `expenseService.ts` (single, recurring, instalment —
  a series belongs to one person on EVERY occurrence, unlike `linkedCashAssetId`) plus `updateExpense`, which the
  dialog hands `?? null` explicitly: `removeUndefinedDeep` strips `undefined`, so moving a row back to «in comune»
  has to be written, not omitted.
- **An optional tab's id is accepted by `getInitialTab` while its panel is gated on the setting**, which used to leave
  Cashflow **blank** — no tab bar, no content — for `?tab=split` or `?tab=cost-centers` with the feature off (a
  bookmark, a shared link, or turning the feature off with the tab open). `effectiveTab` is DERIVED in
  `app/dashboard/cashflow/page.tsx` (never corrected in an effect, or there is a render where the page is empty) and
  falls back to `tracking`; it is settled only once BOTH optional settings have loaded. Any future optional tab
  inherits the fix for free — and must read `effectiveTab`, not `activeTab`, in its header actions too.

- **A RESIDUAL IS OF MONEY THAT HAS MOVED** (2026-09-21). `MemberBalance` carries two figures:
  `remaining`, the whole period's, and **`remainingBooked`**, the same sum over what has already
  happened by `now` — their share of the common rows dated up to today, their own rows up to today,
  and only the income actually received. **The page prints and colours `remainingBooked`**, the
  verdict says «mancano» only about it, and where the calendar takes it is a separate clause
  (`calendarClause` in the verdict, `describeMemberCalendar` under the figure). Before this, the
  500 € bill due on the last of the month was charged to both people as if it had left their
  accounts: a deficit could be made ENTIRELY of money still in the bank, printed in the destructive
  token under «le entrate di X non bastano». It is the same claim `resolveSplitBasis` refuses to
  make about a share, arriving through the other door. The booked pool is split through
  `allocateByShare` too, never by subtracting one allocation from another — that would leave the
  parts short of the whole by a cent.
- **Income nobody owns is DECLARED, never dropped** (2026-09-21). `SplitBasis` carries
  `unattributedIncome` on both of its variants: an income row left «in comune» cannot earn anybody
  a share, and used to vanish behind a mute `continue` — so 60/40 computed on 4000 € of 5000 € was
  printed with the confidence of one computed on all of it. The clause rides on `describeSplitBasis`
  and on `describeMissingBasis` («Altri 1000 € di entrate sono in comune e non entrano nelle
  quote»); what that income DOES to the pool is the «In comune» tile's fact, said there. A row whose
  owner has LEFT Famiglia is not in it: it is declared once, with the spending orphans. The spending
  side had always declared its orphans; this is the mirror.
- **The verdict EXPLAINS, the Quota tile INSTRUCTS.** `describeMissingBasis` is the explanation and
  belongs to the page verdict; **`describeBasisRemedy`** is its imperative twin and is what the
  Quota tile reads, because that tile owns the absence (DESIGN.md → *The Absence-Has-Three-Names
  Rule*: the action goes on the surface that owns the missing thing). Until 2026-09-21 the two were
  the same function, so on a month with no shares the verdict's second clause and the tile's whole
  reading were the identical 18 words ~180px apart — and the branch a household actually hits
  (`missing-income`) named no destination at all while the rare one did.
- **An empty period is not a period whose shares failed.** `resolveHeadline` checks
  `hasNothingToSplit` FIRST: it used to compute the «le quote non si possono calcolare» headline and
  then return it beside a sentence saying there was nothing to divide — two explanations of one
  screen, the first sending the reader to look for data to fix. The «In comune» tile drops its hero
  when `common.rowCount === 0` and renders `EmptyState` instead: a 40px `0 €` over «nessuna spesa»
  is the second name of an absence asserted where the first one belongs.
- **THE PEOPLE SHARE ONE GRID CELL.** The member tiles live inside a single
  `desktop:col-span-7` cell with its own `grid-cols-2` (`grid-cols-3` at three members), so the row
  is 5 + 7 = 12 exactly. As two `col-span-6` cells of the page grid they made 5 + 6 = 11, the second
  person wrapped to a row of their own, and 578×181 px of void opened beside them — the one
  comparison the page exists to make became a diagonal across an empty corner (measured at 1440,
  2026-09-21). `SKELETON_CELLS` describes THAT geometry: three cells, not four.
- **INCOME LEFT «IN COMUNE» PAYS THE POOL FIRST** (owner's decision, 2026-09-27). Every income row
  nobody is named on — a refund on a shared bill, a gift to the couple, a salary somebody forgot to
  attribute — is the household's: `CommonSpending` carries `income`/`incomeRowCount`, and the
  shares divide **`toSplit = max(0, total − income)`**, never the gross. What the income earns
  beyond the spending is **`surplus`, declared and never distributed** (the owner's call: no
  percentage is printed over a pool of zero — `poolClause` says «coperte per intero … non c'è
  niente da dividere, e avanzano X €»). The booked pool is net of the income already RECEIVED, by
  the same calendar-day rule as the bills (`bookedToSplit`), and `common.scheduled` now covers the
  income rows too, so `scheduledSentence` names «X € di entrate già in calendario» when a refund
  is dated ahead. On the page: the «In comune» hero STAYS the spending, and under it a `<dl>` of
  two rows — «Entrate in comune −X €» (U+2212) and «Da dividere Y €», plus «Avanzano Z €» on a
  surplus — absent when no income was left in comune; the verdict says it in the one sentence,
  gross → what came off → what was divided, so the shares that follow are visibly shares of the
  net; the email, which has no hero, carries `describeCommonIncome` in the tile's reading.
  **A salary left in comune is two facts at once**: it reduces the pool (here) AND it buys nobody
  a share (`unattributedIncome`, still declared in Quota). Both are said; neither is folded into
  the other.
- **Income ATTRIBUTED to a person is theirs in full** (same decision: «dipende se verrà dichiarato
  entrata di qualcuno o in comune» — and, asked again, «entra nelle quote»): it is in the base of
  their share and in their residual, whatever its category. Before 2026-09-27 a refund attributed to
  somebody was in neither the pool nor the residual. An income row whose owner has LEFT Famiglia is
  neither the household's nor anyone's: `unassigned.income`/`incomeRowCount`, declared with the
  spending orphans in `describeCommonSpending` («1 entrata per 200 € è di qualcuno che non è più in
  Famiglia»), the verb agreeing with the count across both kinds; the email's AI context lists it
  on its own line.
- **The tab has ONE verb**: «Attribuisci spese» in the page header, which switches to Tracciamento
  with `?owner=common` and opens its «Intestatario» filter there (`initialOwnerId`, settled during
  render on the param as its subject). It is a BUTTON calling `handleTabChange`, never a `<Link>`:
  the route does not change, so Next does not remount the page and `activeTab` — seeded from the
  URL at mount — would stay put while the address bar said otherwise. The period does NOT travel
  with it, deliberately: Tracciamento's axis is not URL-addressable, and a link that landed on a
  different month would be worse than no link.

## Per-page blind spots

- **Divisione**: the shares follow the PERIOD's salaries, so a thirteenth month moves them and a month without one recorded has no shares at all (said by name); income attributed to a person counts in THEIR share whatever its category (a refund moves the percentage, 2026-09-27); a running year's pool carries scheduled rows (declared, like Tracciamento); a member deleted after the fact leaves rows in «Senza intestatario»; there is no bulk attribution, so history stays «all in comune» until edited row by row; the per-person tile spans 6 columns at two people and 4 at three or more; Tracciamento's «Intestatario» filter and the owner chips exist only with the flag on, and the filter's «Senza intestatario» option appears only when the PERIOD holds an orphaned row.
- **Every income row left «in comune» reduces the common spending — a salary nobody attributed included** (2026-09-27). A household that records both salaries without attributing them sees «Entrate in comune −4000 €» under the pool, a surplus and no shares: that is the model working on the data as entered, not a bug. Attribute the salaries (Tracciamento, «Intestatario») and the pool is split again. The Quota tile keeps declaring the same salary as «non intestato» — the two clauses describe one row from two sides.
- **The «In comune» hero is the GROSS spending, not what was divided**: the net sits in the «Da dividere» row under it, and the verdict prints both. A reader comparing the hero with the shares in the verdict is meant to pass through that row.
- **Divisione's shares follow the PERIOD's attributed income** (owner's call): a thirteenth salary or a refund moves the percentage, and a month with no income recorded for a person has no shares at all — `resolveSplitBasis` says so by name instead of printing 100/0. (moved from `CLAUDE.md` → Known Issues on 2026-09-19; base widened from labor income to every attributed income on 2026-09-27)
- **The rendering was first seen on 2026-09-21**, by the Impeccable critique: until then the feature had never been exercised end to end with its flag ON (the 2026-08-31 collaudo stopped after phase A). It now has `e2e/cashflow.split{,.mobile}.spec.ts` on its own account. What those specs deliberately do NOT cover is the wording of each state — `missing-income`, the empty period and every reading are pinned sentence by sentence in the Vitest suites, where they cost milliseconds instead of a page load.
- **An income dated later in the period is not in the booked residual**, by the same rule as an unpaid bill: `remainingBooked` counts only what has arrived, so on the 1st of a month whose salary lands on the 27th a person reads a large negative figure with «Con le spese ancora in calendario restano …» under it. That is the honest reading of «what has happened», not a bug.
- **The period does not travel with «Attribuisci spese»**: it lands on Tracciamento's current axis with the owner filter set, because Tracciamento's period is not URL-addressable. Making it travel is a Tracciamento change, not a Divisione one.
