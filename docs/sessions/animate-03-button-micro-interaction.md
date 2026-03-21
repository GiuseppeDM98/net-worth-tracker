# ANIMATE-03 — Button Micro-interaction

## Categoria
Animate

## Priorità
Media

## Descrizione
Il componente `<Button>` base ha solo `hover:bg-primary/90` come feedback — nessun feedback tattile (scale, lift, press). Il `MetricCard` in Performance usa già `hover:-translate-y-0.5 hover:shadow-md` come pattern di lift. L'obiettivo è portare micro-interazioni coerenti su tutti i button dell'app.

## Stato Attuale
- `components/ui/button.tsx` — `transition-all` presente ma solo cambio colore su hover
- `MetricCard` — usa `hover:-translate-y-0.5 hover:shadow-md transition-all duration-200` come lift
- Nessun `active:scale-*` su nessun bottone
- I button destructive e i button icon (close, delete) non hanno feedback tattile

## Soluzione Proposta
Aggiungere al componente `Button` base:
- `hover:-translate-y-[1px]` — lift leggero (coerente con MetricCard)
- `active:scale-[0.97]` — press feedback (sensazione di click fisico)
- `active:translate-y-[1px]` — opposito al lift, simula pressione verso il basso
- Timing: già gestito da `transition-all` esistente, aggiungere `duration-150`

Per i button `variant="ghost"` e `variant="link"`: solo `active:scale-[0.97]`, no lift (troppo per icone e link inline).

## File Coinvolti
- `components/ui/button.tsx` — modifica principale alle `cva` variants

## Vincoli
- Non aggiungere lift ai button `size="icon"` (troppo aggressivo per le icone piccole)
- Il `disabled` state non deve avere hover/active (già gestito con `disabled:pointer-events-none`)
- Verificare che i button dentro form (es. submit) abbiano il feedback corretto

---

## Prompt per Claude Code

```
Sei in una sessione di sviluppo sul progetto Net Worth Tracker (Next.js 16, React 19, Tailwind v4).

Obiettivo: aggiungere micro-interazioni di hover/press al componente Button per dare feedback tattile alle azioni.

Contesto:
- `components/ui/button.tsx` usa `cva` (class-variance-authority) per le varianti
- Il componente MetricCard in Performance usa già `hover:-translate-y-0.5 hover:shadow-md transition-all duration-200` — questo è il pattern di lift da rispettare
- I button hanno già `transition-all` nella base class

Task:
1. Leggi `components/ui/button.tsx` per capire la struttura attuale delle cva variants
2. Nella base class del button aggiungi:
   - `hover:-translate-y-[1px]` (lift leggero)
   - `active:scale-[0.97] active:translate-y-[1px]` (press feedback)
   - Assicurati che `transition-all duration-150` sia nella base class (non nelle singole varianti)
3. Per `variant="ghost"` e `variant="link"`: aggiungi solo `active:scale-[0.97]`, rimuovi il lift se lo eredita dalla base (override esplicito `hover:translate-y-0`)
4. Per `size="icon"`: override `hover:translate-y-0` (nessun lift per le icone)
5. Verifica che `disabled:pointer-events-none` (già presente) impedisca hover/active su button disabilitati

Vincoli:
- Non usare `transform: scale()` su button che contengono dropdown trigger (potrebbe causare problemi di z-index/clipping)
- Mantieni la coerenza visiva con MetricCard — lo stesso "linguaggio di lift"

Al termine dimmi esattamente su quali componenti testare le interazioni (cerca i button più usati nell'app), quali varianti verificare (default, destructive, outline, ghost, icon), e come verificare che i button disabilitati non abbiano feedback indesiderati.
```
