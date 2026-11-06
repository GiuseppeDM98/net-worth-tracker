---
target: doc/ai/reference/concept-b.html
total_score: 25
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
target_identity: "file:C:\\Users\\Giuseppe\\Documents\\GitHub\\net-worth-tracker\\doc\\ai\\reference\\concept-b.html"
target_fingerprint: "sha256:d9378c16bc0b0565b75830d1e5a9b63ec9d2632b950200059c0078e1a0fc4c67"
target_path: "C:\\Users\\Giuseppe\\Documents\\GitHub\\net-worth-tracker\\doc\\ai\\reference\\concept-b.html"
timestamp: 2026-11-06T17-15-10Z
slug: doc-ai-reference-concept-b-html
---
Method: dual-agent (A: design-review sub-agent, Opus 5.5 · B: detector-evidence sub-agent, Opus 5.5)

Target: `doc/ai/reference/concept-b.html` — Concetto B «La scena» (AI-01, 2026-11-06). Static mock, Operate mode, dark default + light toggle; evidence = 14 Playwright screenshots (390 × 844, 1440 × 900, 1024 × 768 path, 390 light interview), `impeccable detect --json` on the page and on its light copy.

## Design Health Score

| # | Heuristic | Score | Key issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Run: the active stage is a static ring; its only sign of life was «1:12», `aria-hidden`; over ~5 min nothing shows it is still working. |
| 2 | Match System / Real World | 3 | Plain Italian mostly; «I piani PRIMA di scrivere», «tornata», «YTD», «Libera», «risposte in questo browser» are jargon or ambiguous. |
| 3 | User Control and Freedom | 2 | No «Interrompi» on a multi-minute run; «Applica» overwrites Impostazioni with no confirm or undo drawn; the rail cannot jump back. |
| 4 | Consistency and Standards | 2 | Rail screen-reader names differed across scenes; 9px sub-eyebrows; 36px pill and «Torna all'analisi» below 1440; «ASSISTENTE Assistente»; checkboxes behaving like radios. |
| 5 | Error Prevention | 2 | The report's last tile writes three things to settings, all pre-checked, behind one primary button; the consequence sits in parentheses in a 13px label. |
| 6 | Recognition Rather Than Recall | 3 | The report recaps the answers; below 1440 the rail had no visible labels and the interview strip was twelve identical bars. |
| 7 | Flexibility and Efficiency | 2 | No jump-to-step, no skip of a single round; «Chiedi una modifica» reruns only the review. |
| 8 | Aesthetic and Minimalist Design | 3 | Restrained; at 1440 the run showed the same four stages twice; Mese repeats 60.000 € three times. |
| 9 | Error Recovery | 2 | The failed/stale run and the blocked «Avanti» exist only in captions; a disabled «Rispondi» gives no reason. |
| 10 | Help and Documentation | 3 | «Scegli pensando al peggior anno», «Puoi lasciare la pagina», «di solito ~2 min». |
| **Total** | | **25/40** | **Fair — the soundest direction of the three, weakest at its two ends: the rail's semantics and the report's density** |

## Design Specificity Verdict

Content and rules are written for this product (euro loss scenarios, «Preferisco non dire» everywhere, stages and models named, «Fuori dai piani» / «negoziabile», accent limited to model-written content). The form is generic: a dot rail beside a centred card, a progress strip on phone and a checklist of stages are the standard wizard pattern. The thesis that sets it apart — one stage, slides along the reading direction, the rail turning into the run's stages — lives in captions and the replay button; no still shows it. As a direction it is sound and calm.

Detector (Assessment B, exit 2 both modes): `low-contrast` 0, `design-system-*` 0, `cramped-padding` 0. Advisory families only: `undersized-ui-text` 37 (29 at 10px, 8 at 9px — the app's eyebrow and meta sizes), `tiny-text` 12–13, `overused-font` 2 (Geist, the app's fonts), `ai-color-palette` 5–6 in light only (flat `--ai-accent` text). All classified false positives or advisory (on the AI-01 mocks, 2026-11-06, only `low-contrast` and `design-system-*` were criteria; the advisory families come from the app's own type system).

## Strengths

- **Loss question grounded in the user's own money**, each option describing behaviour rather than a label: the best screen in the concept.
- **Run by status, not percentage**: «di solito ~N min» plus elapsed time, «Puoi lasciare la pagina», retry from the saved document; the live region announces only the stage title.
- **Accent discipline in the Assistente**: «Tu» never takes it, model prose stays neutral, proposal and question cards take border and eyebrow, «Conferma»/«Ignora»/«Applica» never violet.

## Priority Issues

- **[P1] The report's accent no longer discriminates, and one tile broke the rule.** Six of eight tiles carried the violet border; «Il colloquio» was accented although it recaps the user's own answers. Fix: de-accent «Il colloquio» (**fixed in this session, mock and canvas**); consider one accented «La proposta» frame around the four proposal tiles, or border only on the model's prose and eyebrow only on the proposal tiles; judge on the phone still.
- **[P1] «Applica» is a buried, irreversible write with no confirmation story.** Last tile of the cascade, three pre-checked writes, one primary button; applied state, undo and «spento mentre una revisione gira» exist only as captions. Fix: draw the applied state and a «Ripristina i target precedenti»; old → new per target; on phone put «Applica» / «Chiedi una modifica» in the verdict area or a sticky footer, following the house small-screen composition.
- **[P1] The rail's accessibility and readability were inconsistent.** Tick names read twice at 1440; nameless below 1440 in the interview; the `.sep` item rendered as a ninth bar; rail and in-card list both labelled «Le fasi». Fix: one naming pattern (visible label + hidden status suffix), hide `.sep` below 1440, rename one «Le fasi». **Fixed in this session**: `.lab` + `<span class="sr">, fatto</span>` suffixes, `.sep` hidden below desktop, rail labels «Il percorso» / «Avanzamento delle fasi».
- **[P2] The run duplicates itself and gives no control.** Four stages in the rail and again in the card at 1440; no «Interrompi»; static active marker. Fix: during the run the rail carries the stages and the card only the active detail, or the rail hides; a secondary «Interrompi»; elapsed time exposed as non-live text (**fixed: no longer `aria-hidden`**); a reduced-motion-safe sign of life.
- **[P2] Semantics and targets below `desktop:` broke house rules.** Headline was a `<p>` under an `<h3>` eyebrow; `aria-label` on a plain `div.card`; 36px pill and «Torna all'analisi»; 9px `.seb`; pill without roving tabindex. **Fixed in this session**: headline `<h3 tabindex="-1">`, eyebrow `<p>`, card `role="region"`, 44px targets below 1440. Open: `.seb` 9px (the app's sub-eyebrow tier, an advisory finding and not a criterion on the AI-01 mocks, 2026-11-06), roving focus (implementation, `useRovingFocus`).

## Persona Red Flags

- **Alex (power user)**: cannot click a completed tick to fix an answer; cannot cancel a run; «Chiedi una modifica» cannot touch strategy or instruments; no ISIN even as placeholder; «1 nov 2026» on every message is noise.
- **Sam (screen reader + keyboard)**: tick names (fixed); headline not a heading (fixed); labels on non-landmark divs (fixed); elapsed time hidden (fixed); exclusive checkboxes untick silently; the counter `role=status` not tied to the textarea; «Registra, attivo» + `aria-pressed` announced twice; the disabled «Rispondi» cannot be focused.
- **Casey (one-handed phone)**: the report's decision at the bottom of ~2,500px; header icons out of thumb reach; composer not sticky; 36px targets (fixed); composer placeholder clipped (fixed, `field-sizing: content`); good: «Avanti» stacks above «Indietro» full-width.

## Minor Observations

- Geist not loaded in the mock: every `.mono` number falls back to a Courier-like face.
- Light-mode capture: button labels faded mid-`color` transition (**fixed: colour excluded from the transition**).
- Dead space at 1440: the stage (160 + 24 + 720px) is left-aligned in a 1,408px frame; the report grid then jumps to full width.
- Sample-data contradiction: «Benzina: di solito dal conto corrente» in memory while the Assistente asks the account (**fixed: the memory row replaced**).
- Waiting frame at 1440 had no rail, so it sat at a different x (**fixed: same stage wrapper**).
- «6000 €» vs «15.000 €» is correct `it-IT` grouping but looks inconsistent side by side.
- «+500 € a ottobre» chip stretched full width (**fixed: `align-self: flex-start`**).
- 0% «oggi» markers at `left:0` vanish; the 3px track is thin for a before/after.
- «Rivista da Opus 5.5» names a model in the verdict; a date and «rivista» are enough.
- The white «+ Nuova conversazione» is the strongest element of the Assistente header.
- Spec vs mock: the spec calls the interview ticks «a sibling list», the mock keeps them in the same `<ol>`.

## Questions

1. When every tile in the report was written by a model, what does the accent still distinguish? Should the report mark what the model did NOT write instead?
2. The rail is «not a control» and the eyebrow already says «Passo 2 di 8»: what decision does the desktop rail support? If none, should completed ticks become the control?
3. Should «Applica» be the path's ninth scene («Cosa cambia nelle tue impostazioni», old → new, then confirm) rather than the eighth tile of a cascade?

Questions skipped: deferred to the session's single AskUserQuestion (the session's rule of 2026-11-06: no question before the mocks, one question after them).
