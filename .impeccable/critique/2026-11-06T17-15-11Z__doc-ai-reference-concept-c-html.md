---
target: doc/ai/reference/concept-c.html
total_score: 25
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
target_identity: "file:C:\\Users\\Giuseppe\\Documents\\GitHub\\net-worth-tracker\\doc\\ai\\reference\\concept-c.html"
target_fingerprint: "sha256:46230e2bdb1141077cdc4e314de0ad9ef0e2caa3affd72e3293e6e01082e4e6a"
target_path: "C:\\Users\\Giuseppe\\Documents\\GitHub\\net-worth-tracker\\doc\\ai\\reference\\concept-c.html"
timestamp: 2026-11-06T17-15-11Z
slug: doc-ai-reference-concept-c-html
---
Method: dual-agent (A: design-review sub-agent, Opus 5.5 · B: detector-evidence sub-agent, Opus 5.5)

Target: `doc/ai/reference/concept-c.html` — Concetto C «Il colloquio» (AI-01, 2026-11-06). Static mock, Operate mode, dark default + light toggle; evidence = 14 Playwright screenshots (390 × 844, 1440 × 900, 1024 × 768 path, 390 light interview), `impeccable detect --json` on the page and on its light copy.

## Design Health Score

| # | Heuristic | Score | Key issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | The run is honest (phase line, stages by STATUS, elapsed time, no percentage); the streamed reply was not in a live region; the disabled «Rispondi» gives no reason. |
| 2 | Match System / Real World | 3 | Euro loss scenarios excellent; «tornata», «I piani PRIMA di scrivere», «negoziabile → non negoziabile» unexplained. |
| 3 | User Control and Freedom | 2 | «Indietro», «Salta il colloquio», «Ignora» exist; «tocca un tema risposto» and «modifica» were plain text; no way to stop the run drawn. |
| 4 | Consistency and Standards | 2 | The concept broke its own accent rule (companion column, fixed questions); 9px `.seb`; words set in mono; «Indietro» after «Avanti». |
| 5 | Error Prevention | 3 | Every write gated (Conferma, the Applica checklist, the revision note); exclusive checkboxes clear silently; Applica pre-checked. |
| 6 | Recognition Rather Than Recall | 2 | Earlier answers scroll away; below 1440 the theme list sits under the thread; revised reports stack with no "current" marker. |
| 7 | Flexibility and Efficiency | 2 | No jump-to-step, no composer during the path: a conversation you cannot type into. |
| 8 | Aesthetic and Minimalist Design | 3 | Calm; cards nested three deep; the scenario list repeats the radio hints; six violet borders in the report. |
| 9 | Error Recovery | 2 | Failed/stale run well designed but only in a caption; no failure state for a stream or a failed Applica. |
| 10 | Help and Documentation | 3 | Help lines, typical durations, the revision footnote. |
| **Total** | | **25/40** | **Fair — honest interview and run; a wizard in chat costume for the path and the report** |

## Design Specificity Verdict

Copy and data are written for this product (euro losses on 60.000 €, «le risposte restano in questo browser», «Fondo pensione: negoziabile → non negoziabile», «3 scritture · nessuno eliminato»). The form could belong to any AI chat: offset «Tu» bubbles, author eyebrows, three pulsing dots, a send arrow. What ties it to the house is the tile shell. The direction holds for the interview and the run, which really are model turns; less for the eight fixed screens and the report, where dressing a wizard and a long-lived plan as messages costs navigation, version clarity and accent truthfulness.

Detector (Assessment B, exit 2 both modes): `low-contrast` 0, `design-system-*` 0, `cramped-padding` 0. Advisory families only: `undersized-ui-text` 49 (38 at 10px, 11 at 9px — the app's eyebrow and meta sizes), `tiny-text` 14, `overused-font` 2 (Geist), `ai-color-palette` 5 in light only (flat `--ai-accent` text), `pulsing-dot` 1 (the streaming «sta scrivendo» indicator, `role="status"`, static under reduced motion — the case the rule allows). All classified false positives or advisory (on the AI-01 mocks, 2026-11-06, only `low-contrast` and `design-system-*` were criteria; the advisory families come from the app's own type system).

## Strengths

- **Loss tolerance grounded in the user's own base**: the best question design across the concepts.
- **Run honesty**: no percentage, no time remaining, «di solito ~N min», the phase line `role=status aria-live=polite`, resumable per phase.
- **Write-gating and accent discipline on controls**: «Conferma», «Modifica», «Ignora» never accented; «Continua», «Invia messaggio», «Registra», the suggestion rows accent on hover/focus only.

## Priority Issues

- **[P1] The accent was drawn on things the model did not write.** The eight fixed path screens had violet eyebrows; the companion column took the accent (active dot and label, a violet «sta leggendo» line). Fix: path eyebrows in `--muted-foreground`, active stage marked with a `--foreground` dot and weight, violet only for interview cards, the in-thread writing line and the report tiles. **Fixed in this session.**
- **[P1] The path is lost on a phone, and the theme list is not interactive.** «tocca un tema risposto» on plain `<li>`; «modifica» a span; below 1440 the «Il percorso» tile renders under the whole thread. Fix: 44px buttons per answered theme; a sticky «2 di 8 · Perdite» chip above the thread opening the list as a bottom sheet; answered turns collapsed into one summary row. Partly addressed (answered themes are buttons on the canvas); the phone composition remains open.
- **[P1] The report as a message loses version and commitment.** A revision appends a rewritten report and the old tiles stay in the thread; at 390 «Applica» comes after the tiles and the composer. Fix: promote the report to page state (verdict, tiles at top level, the thread collapsed into «Il colloquio»); a revision replaces the report with «Versione 2 · cosa è cambiato»; «Applica» under the verdict or in a sticky bar below 1440.
- **[P2] Layout broke at 390.** «Fondo pensione» overlapped «negoziabile → non negoziabile» (`.k .v` flex:none); composer placeholders clipped; the near-limit composer cut at `rows=2`. **Fixed in this session** (`.k` wraps, `field-sizing: content`).
- **[P2] The interview cards are dense and exclusivity is hidden.** Two cards per turn; a 5-option checkbox group where «Altro…» excludes real answers; exclusivity by silent unchecking. Fix: one card per turn with «1 di 2» inside the message; «Altro…» adds a field without excluding; «Preferisco non dire» as its own toggle; announce cleared selections.

## Persona Red Flags

- **Alex (power user)**: eight sequential turns plus up to three rounds, no jump-to-step, no composer during the path; cannot type «40, 20 anni, media» in one go; revisions stack with no diff.
- **Sam (screen reader + keyboard)**: question text was `<p>` not a heading (**fixed: `<h4 tabindex="-1">`**); radiogroup label differs from the visible question; the thread had no `role=log` (**fixed**); focus after «Avanti» unspecified; theme list and «modifica» not focusable; exclusive checkboxes clear silently; two textareas with the same `aria-label`; 9px violet eyebrows.
- **Casey (one-handed phone)**: 36px pill and «Torna all'analisi» (**fixed: 44px below 1440**); Applica at the very bottom; clipped composers (fixed); the scroll-to-newest jump moves content away from the thumb; the path list only by scrolling.

## Minor Observations

- No Geist `@font-face`: mono falls back to a Courier-like face.
- `.f`/`.mono` applied to words («maggio 2027», «nessuna», «Conto corrente»); mono is for numbers.
- Scenes 1–3 have no verdict line (verdict-first).
- «Pronto a registrare.» is the empty-state verdict shown while a proposal is pending.
- Mese showed «L'Assistente scrive…» and the suggestions together (**fixed: suggestions hidden while streaming**).
- «ASSISTENTE Assistente»; orphan «· registra…» line at 390.
- «Indietro» sat to the right of «Avanti» (**fixed**).
- Pending stage dots at `--border` (10% white) fail 3:1 non-text contrast.
- Allocation bars: no legend for the «oggi» tick; a 0% tick vanishes at the left edge.
- The «Dopo «Continua»» storyboard is drawn as a companion tile and Scene 5 shows two composers: both read as real UI.
- `.btn` transitioned `color` (**fixed**).
- The draft paragraphs are English under `lang="it"` (by rule: tracked docs in English).

## Questions

1. If the eight screens are fixed questions with fixed choices and there is no composer until the report, what does the chat skin buy beyond a longer scroll?
2. A plan the user lives with until May 2027: should it live inside a message, or should the conversation live inside the plan?
3. Consulente and Assistente both speak in violet on the same grid with the same composer: how does the user know which one is accountable for a number? If it does not matter, should the Consulente be a mode of the Assistente?

Questions skipped: deferred to the session's single AskUserQuestion (the session's rule of 2026-11-06: no question before the mocks, one question after them).
