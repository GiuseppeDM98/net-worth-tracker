---
target: Previdenza (app/dashboard/pension/page.tsx)
total_score: 29
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 3
target_identity: "file:/Users/giuseppedimaio/Documents/Github.nosync/net-worth-tracker/app/dashboard/pension/page.tsx"
target_fingerprint: "sha256:d99bc625c7ddbd89ebeb2204126a73d2fdf49fe8b791ecdf50311d05df36532c"
target_path: "/Users/giuseppedimaio/Documents/Github.nosync/net-worth-tracker/app/dashboard/pension/page.tsx"
timestamp: 2026-09-13T15-03-59Z
slug: app-dashboard-pension-page-tsx
closed: true
---
Method: dual-agent (A: design review sub-agent · B: detector/browser sub-agent). Browser: Chrome extension not connected; live evidence via repo Playwright (headless, dark/light, 1440 and 390) — screenshots, overflow, targets, console, detect.js overlay.

## Design Health Score — Previdenza (Operate)

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | «ultimo aggiornamento 13 set 2026» is a neutral date; a 60-day-old NAV reads like a fresh one |
| 2 | Match System / Real World | 4 | TFR / Volontario / Datoriale, plafond, anno d'imposta — native fiscal vocabulary |
| 3 | User Control and Freedom | 2 | a contribution can be deleted, never edited; no undo after delete |
| 4 | Consistency and Standards | 3 | dialog copy typed in the component instead of dialogNarrative.ts; ASIDE_LINK_CLASS duplicated |
| 5 | Error Prevention | 2 | «Anno fiscale» free integer, defaults to today's year ignoring the date; ±1 rule only in the service |
| 6 | Recognition Rather Than Recall | 3 | the register-then-overwrite ordering must be recalled monthly; lives in a closed disclosure |
| 7 | Flexibility and Efficiency | 2 | three contributions per month = three full modal cycles; no filter but the year |
| 8 | Aesthetic and Minimalist Design | 3 | marketGain printed three times; «Anno fiscale» tile has ~150px of dead space at 1440 |
| 9 | Error Recovery | 4 | per-tile ErrorNotice, load-error verdict, suspicious/contradictory readings name the cause |
| 10 | Help and Documentation | 3 | COME_AGGIORNARE is good but collapsed by default for the first-run reader |
| **Total** | | **29/40** | **Good** |

## Design Specificity Verdict
Authored for this product: three causes of growth kept apart in the type system, six-state return honesty with contradiction read before suspicion, per-taxpayer plafond, sign tokens only for gain/loss. Deterministic scan: detector clean on `app/dashboard/pension` + `components/pension` (0 findings); the in-page overlay reported 51 hits, all DESIGN.md-declared ramp steps (9/10/11px eyebrow/metadata), shell primitives (sidebar width transition, inset wrapper) or false positives (nested-cards = tiles in the inset). Console: 0 errors/warnings. Overflow: none at 1440 or 390.

## Priority Issues
- **[P0] The page teaches a monthly action it does not offer** — «aggiorna Valore attuale in Patrimonio» appears three times in copy; no control on the page. Fix: second header action «Aggiorna valore» in PensionHeaderAction.tsx (fund picker if >1), mirrored in FondoOggiTile footer. `/impeccable adapt`
- **[P1] The double-count trap is prevented only by prose** — NAV overwrite before registering the month's contributions double-counts silently. Fix: success toast with the next step; staleness judgement in describeFondoOggiFooter (pensionNarrative.ts). `/impeccable clarify`
- **[P1] «Anno fiscale» is a free-typed integer ignoring the date beside it** — PensionContributionDialog.tsx pc-taxyear, defaults to getItalyYear(). Fix: Select of year(date)−1/year/year+1 derived from pc-date via useWatch, superRefine. `/impeccable harden`
- **[P1] Form errors not associated with fields** — no aria-invalid/aria-describedby/role=alert in PensionContributionDialog. `/impeccable harden`
- **[P2] Delete-only ledger, consequence sr-only** — VersamentiTile DeleteButton armed state shows «Conferma?» only; «il conto verrà riaccreditato» only in aria-label. `/impeccable polish`
- **[P2] Axis is a tablist with no tabpanels; three tile ariaLabels drop the visible year** — SegmentedPill has no overflow handling (one tab per tax year, unbounded). `/impeccable harden`
- **[P2] Primary action and year pill 32px tall at 390px** (measured: Registra versamento 178×32, 2026/2025 55×32); delete buttons 28×28 at 1440. `/impeccable adapt`

## Persona Red Flags
- Alex: three modal cycles per month, no «Salva e aggiungi un altro», no nature/fund filter, NAV overwrite off-page.
- Jordan: first run = 4 of 5 tiles prose, the orienting disclosure closed; most likely to overwrite the NAV first.
- Sam: tablist without tabpanels; tile names shorter than visible labels; N sr-only live regions (one per DeleteButton) announcing «Eliminazione annullata» on blur.
- Investor overwriting the NAV monthly: the action is not here; nothing says the value is stale; a late-credited statement wears the loudest sign colour.

## Minor Observations
describeVersato ignores fundSubject(); describeAnnoFiscaleAside conflates missing and unassigned; dead ternary in annoFiscaleClause; ASIDE_LINK_CLASS duplicated; empty state single 5-col tile in a 12-col grid; «Contributo datoriale · retribuzione, non rendimento» wraps to three lines in RendimentoTile at 1440.

## Questions to Consider
1. If the monthly NAV overwrite is the operation this page exists for, why is it not an action at all?
2. Would a «pending credit» contribution eliminate the contradictory state, the late-credit artefact and the double-count trap at once?
3. How many accessible names in the codebase are the shape a test wanted rather than what a user hears?
