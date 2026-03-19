# Session 06 — Typography & Emoji Cleanup

## Obiettivo
Rimuovere le emoji usate come icone nei titoli di sezione e nei hint card, sostituendole con icone Lucide coerenti con il resto dell'app.

## Scope
- `components/fire-simulations/FireCalculatorTab.tsx`
- `components/cashflow/CurrentYearTab.tsx`

## Fix da applicare

### 1. FireCalculatorTab.tsx — Emoji nelle h2

**Problema**: Due section headers usano emoji inline:
```tsx
<h2 className="text-xl font-semibold text-gray-900 mb-4">📊 Metriche Attuali</h2>
<h2 className="text-xl font-semibold text-gray-900 mb-4">🎯 Metriche Previste</h2>
```

Le emoji sono inconsistenti con il resto dell'app che usa icone Lucide, e renderizzano diversamente su Windows/Android/iOS.

**Fix**: Sostituire le emoji con icone Lucide già disponibili nel file:
```tsx
import { BarChart3, Target } from 'lucide-react';

// Metriche Attuali
<h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
  <BarChart3 className="h-5 w-5 text-blue-500" />
  Metriche Attuali
</h2>

// Metriche Previste
<h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
  <Target className="h-5 w-5 text-purple-500" />
  Metriche Previste
</h2>
```

**Cerca anche**:
- `ℹ️ Come funziona il FIRE?` nell'info box — sostituire `ℹ️` con `<Info className="h-4 w-4" />`
- `🎉` usata nelle stringhe di testo condizionale (es. "Hai raggiunto la Financial Independence!") — queste sono **OK da lasciare** perché sono in testo narrativo, non in titoli di sezione
- `⚠️` in "Superiore al Safe Withdrawal Rate" — sostituire con `<AlertTriangle className="h-3.5 w-3.5 inline" />`
- `📉` / `📈` nelle differenze FIRE Number — sostituire con `TrendingDown`/`TrendingUp` già importati

### 2. CurrentYearTab.tsx — Emoji nel hint card

**Problema**: Un hint card usa `💡` inline:
```tsx
<div>💡 <strong>Suggerimento:</strong> ...</div>
```

**Fix**: Sostituire con icona `Lightbulb` o `Info` da Lucide:
```tsx
import { Info } from 'lucide-react';

<div className="flex items-start gap-2">
  <Info className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />
  <div><strong>Suggerimento:</strong> ...</div>
</div>
```

## Icone suggerite (già probabilmente importate)
| Emoji | Icona Lucide | Import |
|-------|-------------|--------|
| 📊 | `BarChart3` | lucide-react |
| 🎯 | `Target` | lucide-react |
| ℹ️ | `Info` | lucide-react |
| ⚠️ | `AlertTriangle` | lucide-react |
| 💡 | `Lightbulb` o `Info` | lucide-react |
| 📉 | `TrendingDown` | lucide-react |
| 📈 | `TrendingUp` | lucide-react (già importato) |

## Emoji OK da lasciare
- `🎉` in testi narrativi/celebrativi (non titoli)
- Emoji nelle note utente (non codice UI)

## Verifica
1. Verificare visivamente che i titoli di sezione abbiano l'icona Lucide corretta
2. Verificare che nessun titolo `<h2>` o `<h3>` contenga emoji
3. `npm test` deve passare

---

## Prompt per Claude

```
Leggi AGENTS.md, CLAUDE.md e COMMENTS.md prima di iniziare.

Stai lavorando su: Session 06 — Typography & Emoji Cleanup
Leggi il file docs/sessions/session-06-typography-emoji-cleanup.md per le specifiche complete.

File target:
- components/fire-simulations/FireCalculatorTab.tsx
- components/cashflow/CurrentYearTab.tsx

Fix 1 — FireCalculatorTab.tsx:
Cerca tutti i titoli h2/h3 che contengono emoji. Sostituisci:
- 📊 → icona BarChart3 da lucide-react (import se non c'è)
- 🎯 → icona Target da lucide-react (import se non c'è)
- ℹ️ → icona Info da lucide-react (import se non c'è)
- ⚠️ → icona AlertTriangle da lucide-react (import se non c'è)
- 📉/📈 nel testo condizionale → TrendingDown/TrendingUp (già importati)

Pattern per sostituire emoji in titolo:
  PRIMA: <h2 className="...">📊 Titolo</h2>
  DOPO:  <h2 className="... flex items-center gap-2"><BarChart3 className="h-5 w-5 text-blue-500" />Titolo</h2>

Le emoji 🎉 in testi narrativi condizionali (es. "Hai raggiunto la FI!") sono OK da lasciare.

Fix 2 — CurrentYearTab.tsx:
Trova il hint card con 💡 inline. Sostituisci con struttura flex + icona Info o Lightbulb da lucide-react.

Dopo le modifiche aggiorna SESSION_NOTES.md con le righe della tabella Session 6.
Alla fine esegui npm test.
```
