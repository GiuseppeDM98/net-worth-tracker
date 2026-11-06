---
target: doc/ai/reference/concept-a.html
total_score: 25
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
target_identity: "file:C:\\Users\\Giuseppe\\Documents\\GitHub\\net-worth-tracker\\doc\\ai\\reference\\concept-a.html"
target_fingerprint: "sha256:83edab9104471d6aaaf7f5a40f08cdc44cda7675c6f8cc103fae3e7a073d859a"
target_path: "C:\\Users\\Giuseppe\\Documents\\GitHub\\net-worth-tracker\\doc\\ai\\reference\\concept-a.html"
timestamp: 2026-11-06T17-15-10Z
slug: doc-ai-reference-concept-a-html
---
Method: dual-agent (A: design-review sub-agent, Opus 5.5 · B: detector-evidence sub-agent, Opus 5.5)

Target: `doc/ai/reference/concept-a.html` — Concetto A «Il taccuino» (AI-01, 2026-11-06). Static mock, Operate mode, dark default + light toggle; evidence = 14 Playwright screenshots (390 × 844, 1440 × 900, 1024 × 768 path, 390 light interview), `impeccable detect --json` on the page and on its light copy.

## Design Health Score

| # | Heuristic | Score | Key issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | «Passo 2 di 8» and the margin note are good; the Register verdict «Pronto a registrare.» stays put while a question waits; at 390 the run status sits under nine closed rows. |
| 2 | Match System / Real World | 3 | Loss scenarios in euros are excellent; «Tornata», «Proventi», «Ruoli», «I piani PRIMA di scrivere» are internal jargon. |
| 3 | User Control and Freedom | 2 | Reopening a row silently invalidates every later chip (caption only); a closed «tornata» reopens read-only; «Applica» has no undo. |
| 4 | Consistency and Standards | 2 | Accent fill on the user's answer chips; 9px sub-eyebrows under the 10px eyebrow; 36px controls below 1440; the 720px document becomes a full-width grid in the report. |
| 5 | Error Prevention | 2 | «Applica» pre-checks three writes that replace the Impostazioni targets, no confirmation; exclusive answers are checkboxes. |
| 6 | Recognition Rather Than Recall | 3 | Chips keep the answers visible; at 390 they truncate without an ellipsis. |
| 7 | Flexibility and Efficiency | 2 | No jump to a step, no keyboard path through eight blocks; in the Assistente a question costs radio + «Rispondi» although a composer sits below. |
| 8 | Aesthetic and Minimalist Design | 3 | Calm and achromatic; the Assistente says its mode three times; Mese repeats the same four numbers; four violet borders at once in the report. |
| 9 | Error Recovery | 2 | The failed/stale run with «Riprova» is specified in prose only; no error frame drawn. |
| 10 | Help and Documentation | 3 | Inline help, «Puoi lasciare la pagina», «Base di oggi»; nothing else needed. |
| **Total** | | **25/40** | **Fair — a sound Consulente half, an Assistente half that does not yet carry the idea** |

## Design Specificity Verdict

The Consulente half is written for this product: −10/−25/−40% turned into euros on the user's 60.000 € base, behavioural radio hints, «di solito ~2 min» with no percentage, the collapse-to-chip reusing the house Closed-Row Rule. The Assistente half is not specific in the same way: offset «Tu» bubbles, author headers, a timestamp on every message and a sparkle «Continua con» list make the generic chat column the thesis says it must not be.

Detector (Assessment B, exit 2 both modes): `low-contrast` 0, `design-system-*` 0, `cramped-padding` 0. Advisory families only: `undersized-ui-text` 33 (24 at 10px, 9 at 9px: the app's own eyebrow and meta sizes), `tiny-text` 13, `overused-font` 2 (Geist Sans / Geist Mono, the app's fonts), `ai-color-palette` 4 in light only (the flat `--ai-accent` text, not a gradient). All classified false positives or sanctioned by AI-01 § 5; the 9px speaker labels are the one tier worth a second look.

## Strengths

- **The «Le perdite» open block**: euro scenarios, behavioural hints, one «Avanti» — the most specific screen in the set; keep it as the reference block.
- **The collapse-to-chip path**: eight rows are a progress bar, a summary and shortcuts back; in the report they fold further to «1–8 Il percorso · 8 risposte».
- **Accent discipline mostly held**: path, verdicts, user lines, companion column and model prose stay achromatic; «Conferma» neutral; «Rivedi il report» / «Continua» accent on hover only.

## Priority Issues

- **[P1] The Assistente is still a chat column.** Offset «Tu» bubbles, «Tu»/«Assistente» headers, a date on every message, cards nested inside the model's turn: the "thread is the same document" claim is true only of the collapsed proposal row. Fix: the user's turn as a document line (quoted, no bubble, no offset); the model's prose as paragraphs under a running head; one «1 nov 2026» on the thread; proposal and question cards at the document's margin of attention.
- **[P1] Accent used as a fill on the user's own answers.** `.chip.tint` (10% accent) on «Tornata 1 · Con un mutuo…» and «Colloquio · 1 tornata»; on the run the active phase *title* turned violet though it is app status. Fix: neutral `--muted` chips, provenance only through the row eyebrow; on the run keep the accent on the dot or drop it. **Fixed in this session** (chips neutral, phase title in foreground, re-detected 0 `low-contrast`).
- **[P1] Phone first screen buried by the path during the run.** At 390 nine closed rows (~400px) precede «Propongo la strategia.»; «Le fasi» starts near y = 700. Fix: once «Riepilogo» is confirmed fold rows 1–8 into the single «1–8 Il percorso» row; below desktop put the phase list above or inside the run block.
- **[P2] Stale verdict and two answer channels in Register.** «Pronto a registrare.» while «Da quale conto hai pagato la benzina?» waits; «Rispondi» disabled outside the card plus a free composer. Fix: a verdict that follows the thread; commit on radio selection or put «Rispondi» inside the card; say the composer answers too, or disable it while a question is open.
- **[P2] Unguarded consequences.** Reopening a block invalidates later chips with no warning drawn; «Applica» starts with three pre-checked writes. Fix: an inline `--warning-foreground` footnote before «Avanti» on reopen; a before → after line per write; an «Annulla» after applying.

## Persona Red Flags

- **Alex (power user)**: no jump to step 6, no in-place edit of the summary; radio + «Rispondi» costs two actions; four icon-only header buttons; nothing skips the eight blocks for a returning user.
- **Sam (screen reader + keyboard)**: the «ahead» rows are non-focusable `div`s with no "non disponibile" state; phase states colour/dot only; the question text was not the radiogroup's label; exclusive checkboxes not announced; the `role="status"` counter would speak on every keystroke; «·» as a row number reads «punto»; two sections labelled «Conversazione»; 9px sub-eyebrows.
- **Casey (one-handed phone)**: pill buttons and «Torna all'analisi» at 36px (**fixed: 44px below 1440**); header icon cluster top-left; closed proposal rows wrapping to 2–3 lines (**fixed: wrap allowed, title flex**); chips clipping without ellipsis (**fixed: inline-block ellipsis**); «Applica» ~2000px down.

## Minor Observations

- Geist is not loaded in the mock; numbers and chips render in a Courier-like fallback.
- Light capture: «Continua», «Salta il colloquio», «Riproduci» nearly invisible mid-transition because `.btn` transitioned `color` (**fixed: colour excluded from the transition**).
- Mese draws the open «Proposta di obiettivo» card and its confirmed row together; reads as a duplicate, not the next frame (**now captioned as the next frame**).
- At 390 the composer placeholder and the near-limit composer clipped mid-line (**fixed: `field-sizing: content`**).
- «ASSISTENTE Assistente» doubles eyebrow and title; «· registra una spesa…» wraps onto its own line at 390.
- «Strumenti» says «ISIN verificato sul web» while rows say «ISIN di esempio»; «Base di oggi» repeats the help line.
- The today-marker on the 3px bars is hard to see; sparkle icon on suggestions is a generic cue.
- When every report tile is model-written, four violet borders become wallpaper.

## Questions

1. The document claims "one voice, the app's", yet «Ho letto le tue risposte», «Propongo la strategia», «Conosco 2 conti» are first-person: who speaks, and should the model's voice be the one the accent marks?
2. Should the Assistente stop pretending to be a document and be an honest conversation that borrows only the collapse-to-chip, or go all the way (no bubbles, the user's words as quoted ledger lines)?
3. If the whole report chapter is model-written, should the violet mark what the user has not yet checked rather than mere authorship?

Questions skipped: deferred to the session's single AskUserQuestion (AI-01 decision 37: no question before the mocks, one question after them).
