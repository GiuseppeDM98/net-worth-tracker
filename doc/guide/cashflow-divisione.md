# Cashflow › Divisione

> **Quando aprire questa guida** — chi tocca `components/cashflow/ExpenseSplitTab.tsx`, `lib/utils/{expenseSplitSummary,expenseSplitNarrative}.ts` o la sezione email in `lib/server/monthlyEmailService.ts`. In `AGENTS.md` resta lo stub con l'essenziale; qui c'è la regola completa. Moduli e file: `CLAUDE.md` → *Key Files* → la voce di quest'area.

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
- **The share is NEVER invented.** `resolveSplitBasis` returns `unavailable` — with `missingNames` — when fewer than two
  people exist, when no labor category is configured, or when **one person has no salary in the period**; every
  split-dependent figure (`share`, `commonShare`, `remaining`) is then `null` and the sentences name the missing input.
  Without that guard the person who DID record a salary silently carries 100% of the pool. Own spending survives an
  unavailable basis — it is a fact whatever the shares do.
- **The base is the PERIOD's attributed labor income** (owner's decision, 2026-08-31), not the RAL and not a trailing
  window: it is the most faithful reading of «this month» and the most volatile one. Do not «stabilise» it without
  saying so on screen — the honesty of the feature is that the reading names its base out loud.
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

## Per-page blind spots

- **Divisione**: no Playwright spec, and **the feature has never been exercised end-to-end with the flag ON** (the 2026-08-31 collaudo stopped after phase A by the owner's decision) — the pure layer, the flag-off invariance and the build are proven, the writes of `personalMemberId` and the rendering are not; the shares follow the PERIOD's salaries, so a thirteenth month moves them and a month without one recorded has no shares at all (said by name); income attributed to a person outside `laborIncomeCategoryIds` is in neither the pool nor the residual; a running year's pool carries scheduled rows (declared, like Tracciamento); a member deleted after the fact leaves rows in «Senza intestatario»; there is no bulk attribution, so history stays «all in comune» until edited row by row; the per-person tile spans 6 columns at two people and 4 at three or more.
