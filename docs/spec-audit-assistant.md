# Audit Tecnico — Assistente AI UI

**Data:** 2026-04-09  
**Scope:** `components/assistant/` (tutti i file) + `app/dashboard/assistant/page.tsx`  
**Target utenti:** Investitori italiani, desktop e mobile  

---

## Audit Health Score

| # | Dimensione | Score | Finding principale |
|---|-----------|-------|--------------------|
| 1 | Accessibility | 2/4 | No `aria-live` sullo stream; action buttons invisibili da tastiera |
| 2 | Performance | 2/4 | `scrollIntoView` su ogni token; `components` ReactMarkdown ricreato ad ogni render |
| 3 | Responsive Design | 3/4 | Sheet mobile non si chiude dopo selezione thread; touch target piccoli nei tab memoria |
| 4 | Theming | 3/4 | Colori categoria hard-coded (ma con varianti dark mode) |
| 5 | Anti-Pattern | 3/4 | `opacity-0 group-hover` inaccessibile su touch |
| **Totale** | | **13/20** | **Acceptable — lavoro significativo richiesto** |

---

## Anti-Patterns Verdict

Nessun "AI slop" visibile: niente gradient text, glassmorphism, hero metrics generiche o font system. Il design è sobrio e coerente con l'estetica Linear/Vercel del resto dell'app. Il problema principale è l'utilizzo di `opacity-0 group-hover` per le action button delle memory row — un pattern che funziona bene su desktop ma è completamente inaccessibile su touch e da tastiera.

---

## Executive Summary

- **Audit Health Score: 13/20** (Acceptable)
- Totale issue: **2 P1 · 6 P2 · 4 P3**
- Top issue critici:
  1. Nessuna `aria-live` region sullo streaming — i screen reader non annunciano il testo in arrivo
  2. Action button della memoria (edit/archive/delete) inaccessibili da tastiera e touch (opacity-0)
  3. Sheet mobile non si chiude dopo la selezione di un thread — l'utente deve chiuderla manualmente
  4. `scrollIntoView` smooth ad ogni token SSE — causa jank visibile su dispositivi lenti
  5. Oggetto `components` di ReactMarkdown ricreato ad ogni render — re-render non necessari

---

## Findings per Priorità

---

### P1 — Bloccante / WCAG AA

---

#### [P1] Nessuna `aria-live` region sul contenuto in streaming

- **Location:** [AssistantStreamingResponse.tsx](components/assistant/AssistantStreamingResponse.tsx) — componente radice `div.space-y-3`
- **Categoria:** Accessibility
- **Impact:** I screen reader (VoiceOver, NVDA) non annunciano il testo dell'assistente mentre arriva. L'utente non vedente invia un messaggio e non riceve nessun feedback. Viola WCAG 4.1.3 (Status Messages).
- **WCAG:** 4.1.3 Status Messages (Level AA)
- **Fix direction:** Aggiungere `aria-live="polite"` e `aria-atomic="false"` al container dei messaggi dell'assistente. Durante lo streaming usare `aria-live="assertive"` sul wrapper del messaggio attivo per annunciare i chunk di testo. Aggiungere un `aria-label` descrittivo al container della lista messaggi (es. `aria-label="Conversazione con l'assistente"`).
- **Suggested command:** `/harden`

---

#### [P1] Action button memoria invisibili da tastiera e touch

- **Location:** [AssistantMemoryItemRow.tsx:126](components/assistant/AssistantMemoryItemRow.tsx#L126)
- **Categoria:** Accessibility + Responsive
- **Impact:** Le azioni edit/archive/delete hanno classe `opacity-0 group-hover:opacity-100`. Su dispositivi touch (mobile) non c'è hover — i pulsanti sono visivamente inaccessibili. Da tastiera, il focus raggiunge i pulsanti ma l'utente non vede su cosa è posizionato. Viola WCAG 2.1.1 (Keyboard) e 1.4.3 (Contrast).
- **WCAG:** 2.1.1 Keyboard (Level A), 2.4.7 Focus Visible (Level AA)
- **Fix direction:** Rimuovere `opacity-0` e sostituire con visibilità sempre attiva su mobile (es. mostrare sempre le azioni su schermi touch con `@media (pointer: coarse)`), oppure aggiungere `focus-within:opacity-100` alla riga in modo che i pulsanti diventino visibili quando qualsiasi elemento interno riceve il focus. Alternativa: menu contestuale su long-press su mobile.
- **Suggested command:** `/harden`

---

### P2 — Major / da correggere prima del rilascio

---

#### [P2] `scrollIntoView` smooth su ogni token SSE

- **Location:** [AssistantPageClient.tsx:470](components/assistant/AssistantPageClient.tsx#L470)
- **Categoria:** Performance
- **Impact:** Il `useEffect` con `renderedMessages` come dipendenza chiama `scrollIntoView({ behavior: 'smooth' })` ad ogni aggiornamento di stato durante lo streaming. Su dispositivi lenti o con risposte lunghe (centinaia di token) questo causa scroll jank continuo e può saturare il thread principale con animazioni CSS.
- **Fix direction:** Separare lo scroll di streaming (su ogni token) da quello a caricamento (una sola volta). Durante lo streaming usare `scrollIntoView({ behavior: 'instant' })` oppure `el.scrollTop = el.scrollHeight` direttamente, riservando `smooth` solo al caricamento thread da RQ.
- **Suggested command:** `/optimize`

---

#### [P2] Oggetto `components` di ReactMarkdown ricreato ad ogni render

- **Location:** [AssistantStreamingResponse.tsx:83-104](components/assistant/AssistantStreamingResponse.tsx#L83)
- **Categoria:** Performance
- **Impact:** L'oggetto `components` con gli override di `table`, `thead`, `th`, `td`, `tr` è definito inline nel JSX. React lo considera un nuovo oggetto ad ogni render e ReactMarkdown si rimonta completamente anche quando il contenuto del messaggio non cambia (es. aggiornamento `webSearchUsed`). Su conversazioni lunghe con molti messaggi questo causa re-render cascata.
- **Fix direction:** Estrarre l'oggetto `components` a livello di modulo (fuori dal componente), come costante immutabile. Es. `const MARKDOWN_COMPONENTS = { table: ..., thead: ..., ... }` prima di `export function AssistantStreamingResponse`.
- **Suggested command:** `/optimize`

---

#### [P2] `<textarea>` senza `<label>` associata

- **Location:** [AssistantComposer.tsx:182](components/assistant/AssistantComposer.tsx#L182)
- **Categoria:** Accessibility
- **Impact:** La textarea ha solo `placeholder` come indicazione. Quando l'utente inizia a scrivere il placeholder scompare e lo screen reader non ha un'etichetta persistente da leggere. Viola WCAG 1.3.1 (Info and Relationships) e 4.1.2 (Name, Role, Value).
- **WCAG:** 1.3.1 Info and Relationships (Level A), 4.1.2 Name Role Value (Level A)
- **Fix direction:** Aggiungere `aria-label="Scrivi un messaggio all'assistente"` alla textarea, oppure usare un `<label htmlFor>` visivamente nascosto con `sr-only`.
- **Suggested command:** `/harden`

---

#### [P2] Tab filtro memoria senza semantica ARIA corretta

- **Location:** [AssistantMemoryPanel.tsx:210-226](components/assistant/AssistantMemoryPanel.tsx#L210)
- **Categoria:** Accessibility
- **Impact:** I pulsanti "Attivi" / "Archiviati" si comportano come tab ma sono `<button>` plain senza `role="tab"`, `aria-selected`, né `role="tablist"` sul wrapper. I screen reader non possono capire che si tratta di tab e non annunciano lo stato selezionato.
- **WCAG:** 4.1.2 Name Role Value (Level A)
- **Fix direction:** Aggiungere `role="tablist"` al div wrapper e `role="tab"` + `aria-selected={filterTab === tab}` a ogni pulsante. Il pannello contenuto dovrebbe avere `role="tabpanel"`.
- **Suggested command:** `/harden`

---

#### [P2] Sheet mobile non si chiude dopo selezione thread

- **Location:** [AssistantPageClient.tsx:820-846](components/assistant/AssistantPageClient.tsx#L820)
- **Categoria:** Responsive
- **Impact:** Su mobile, quando l'utente apre il drawer "Conversazioni" e seleziona un thread, la Sheet rimane aperta. L'utente deve chiuderla manualmente (swipe o pulsante X) per tornare alla conversazione. Questo è contro il pattern UX atteso su mobile: selezionare un item da una lista/drawer dovrebbe chiudere il drawer automaticamente.
- **Fix direction:** Usare lo stato controllato di Sheet (`open` + `onOpenChange`) nel componente padre. Quando `onSelect` viene chiamato dentro la Sheet, invocare anche `setSheetOpen(false)`. Alternativa: passare un callback `onClose` al `ThreadList` dentro la Sheet.
- **Suggested command:** `/adapt`

---

#### [P2] Touch target insufficienti nei tab filtro memoria

- **Location:** [AssistantMemoryPanel.tsx:216](components/assistant/AssistantMemoryPanel.tsx#L216)
- **Categoria:** Responsive
- **Impact:** I pulsanti "Attivi" / "Archiviati" hanno `py-1` che produce un'altezza di ~24-28px — significativamente sotto il minimo raccomandato di 44×44px per touch target (Apple HIG, Material Design). Su mobile, l'utente dovrà fare tap multipli per selezionare il tab corretto.
- **Fix direction:** Aumentare il padding verticale a `py-2.5` (≈40px) o aggiungere `min-h-[44px]` ai pulsanti. Verificare anche le action button da 24×24px (h-6 w-6) in `AssistantMemoryItemRow` che hanno lo stesso problema.
- **Suggested command:** `/adapt`

---

### P3 — Polish / nice-to-fix

---

#### [P3] Colori categoria memoria hard-coded senza token semantici

- **Location:** [AssistantMemoryItemRow.tsx:27-31](components/assistant/AssistantMemoryItemRow.tsx#L27)
- **Categoria:** Theming
- **Impact:** `CATEGORY_COLORS` usa `bg-blue-500/10 text-blue-600 dark:text-blue-400` ecc. I colori funzionano e hanno varianti dark, ma non sono token semantici — se il design system cambia palette, vanno aggiornati manualmente in questo file.
- **Fix direction:** Nessuna urgenza. Se si vuole allineare al sistema: valutare se definire classi Tailwind semantiche (es. `category-goal`, `category-risk`) in un CSS layer, oppure accettare i colori hard-coded come eccezione giustificata per badge categoria.
- **Suggested command:** `/normalize`

---

#### [P3] `SelectTrigger` mode/year senza `aria-label`

- **Location:** [AssistantComposer.tsx:102](components/assistant/AssistantComposer.tsx#L102), [AssistantComposer.tsx:159](components/assistant/AssistantComposer.tsx#L159)
- **Categoria:** Accessibility
- **Impact:** I `SelectTrigger` per la modalità e per l'anno non hanno `aria-label`. Screen reader legge solo il valore selezionato (es. "Analisi mensile") senza contesto su cosa stia selezionando.
- **Fix direction:** Aggiungere `aria-label="Modalità di analisi"` al primo Select e `aria-label="Anno di riferimento"` al secondo. Il Select Radix propagherà questi al trigger button.
- **Suggested command:** `/harden`

---

#### [P3] Colore save button hard-coded emerald

- **Location:** [AssistantMemoryItemRow.tsx:202](components/assistant/AssistantMemoryItemRow.tsx#L202)
- **Categoria:** Theming
- **Impact:** `text-emerald-600 hover:text-emerald-700` per il pulsante "Salva" non usa variante dark mode. In dark mode il colore potrebbe avere contrasto insufficiente.
- **Fix direction:** Sostituire con `text-green-600 dark:text-green-400` (già usato altrove nell'app, es. `AssistantContextCard.tsx`) per coerenza e dark mode coverage.
- **Suggested command:** `/normalize`

---

#### [P3] Chip senza `type="button"`

- **Location:** [AssistantPromptChips.tsx:26](components/assistant/AssistantPromptChips.tsx#L26)
- **Categoria:** Accessibility / Anti-pattern
- **Impact:** I `<button>` nei chip non hanno `type="button"` esplicito. In un contesto form (improbabile ma possibile) si comporterebbero come `type="submit"`. Non un problema attuale ma best practice da rispettare.
- **Fix direction:** Aggiungere `type="button"` a ogni `<button>` che non intende fare submit di form.
- **Suggested command:** `/harden`

---

## Pattern Sistemici

- **Action button visibili solo su hover** (`opacity-0 group-hover:opacity-100`): presente sia in `AssistantMemoryItemRow` che nel thread delete in `AssistantPageClient`. Su touch device entrambi sono inaccessibili. Il pattern va rivisto globalmente per l'assistente.
- **Touch target insufficienti**: `h-6 w-6` (24px) per le action button di memoria e tab filtro ~28px. L'intera interfaccia della memoria è progettata per desktop — su mobile va adattata con target almeno 44px.
- **Mancanza di `aria-live` su contenuto dinamico**: né il pannello streaming né i toast di feedback usano regioni live dichiarate. La memoria che si aggiorna, i messaggi in arrivo e gli errori non sono annunciati da screen reader.

---

## Aspetti Positivi

- **Pattern streaming plain-text → markdown** ben implementato: evita il re-parsing durante lo streaming e il layout shift associato.
- **`resolvedThreadId` pattern** corretto per evitare stale closure con React Query durante lo stream.
- **Stop button sempre abilitato** durante lo streaming: buona scelta UX, non bloccata da `canSubmit`.
- **2-click delete confirmation con auto-disarm a 3s**: pattern solido sia in thread list che in memory row.
- **`cachedFormatCurrencyEUR`** usato correttamente in `AssistantContextCard` — nessuna allocazione `Intl.NumberFormat` per render.
- **Skeleton strutturale** in `AssistantContextCard` che mantiene il layout stabile durante il fetch del bundle.
- **`useMemo` per `renderedMessages`** invece di `useEffect + setState` — pattern corretto che evita render doppio.
- **Design pulito**: nessun AI slop, niente glassmorphism o gradient text. Coerente con l'estetica del prodotto.

---

## Azioni Raccomandate (in ordine di priorità)

1. **[P1] `/harden`** — Aggiungere `aria-live` sullo stream, `aria-label` su textarea e Select, `role="tab"` sui filtri memoria, `type="button"` sui chip
2. **[P1] `/adapt`** — Risolvere action button opacity-0 su touch per memory items e thread list; chiusura automatica Sheet mobile dopo selezione thread
3. **[P2] `/optimize`** — Estrarre `MARKDOWN_COMPONENTS` a livello modulo; sostituire `scrollIntoView smooth` con scroll diretto durante streaming
4. **[P2] `/adapt`** — Aumentare touch target filtri memoria e action button da 24px a ≥44px
5. **[P3] `/normalize`** — Allineare `text-emerald-600` save button a `text-green-600 dark:text-green-400`; valutare token semantici per colori categoria
6. **[P3] `/polish`** — Rifinitura finale dopo le fix precedenti

---

*Audit generato seguendo il protocollo impeccable:audit — ri-eseguire `/audit` dopo le fix per verificare il miglioramento dello score.*
