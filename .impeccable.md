# Impeccable Design Context — Net Worth Tracker

## Design Context

### Users
Investitori italiani attenti e autonomi che gestiscono in proprio il loro patrimonio — azioni, ETF, BTP, crypto, immobili, conti correnti. Usano l'app regolarmente (almeno mensile) per monitorare performance, dividendi e progresso verso FIRE. Non sono trader: sono accumulatori di lungo periodo, metodici, che vogliono dati affidabili e leggibili senza perdere tempo.

**Job to be done**: "Capire in pochi secondi com'è messa la mia situazione finanziaria, confrontarla col passato, e sentire che sto andando nella giusta direzione."

### Brand Personality
**Elegante · Sofisticato · Personale**

L'app non è uno strumento impersonale: è un cruscotto privato, quasi un diario finanziario di qualità. Come un wealth manager digitale su misura — non parla a tutti, parla a te. La sofisticazione si esprime nella cura per i dettagli, non nella complessità.

### Aesthetic Direction
**Riferimento primario**: Linear / Vercel — tipografia forte, dark mode eccellente, geometria pulita, microinterazioni fluide, nessun decoro superfluo.

**Visual tone**: Ultra-clean con personalità. Spazio bianco intenzionale. Gerarchia tipografica netta. Dati che respirano. Animazioni che informano, non intrattengo.

**Direzione**: Overdrive — implementazioni tecnicamente ambiziose che fanno alzare il sopracciglio. Fisica spring su dialog, scroll-driven reveals, counter animati, transizioni che sembrano impossibili per una web app.

**Anti-riferimenti**: Bloomberg terminal (troppo freddo/denso), consumer fintech colorato alla Revolut (troppo leggero per dati seri), Material Design (troppo generico).

**Tema**: Dark mode come esperienza primaria (dati finanziari su sfondo scuro sembrano più precisi e professionali), light mode pienamente supportata.

### Design Principles

1. **Dati prima, decorazione mai** — ogni elemento visivo guadagna il suo spazio comunicando un'informazione. Se togliendolo la pagina è più chiara, va tolto.

2. **Movimento con intenzione** — le animazioni rivelano struttura e relazioni, non distrano. Il tempo e la fisica devono sembrare naturali (spring, ease-out-quart). Rispetta sempre `prefers-reduced-motion`.

3. **La densità è una feature** — questo è un tool per power user. Non semplificare fino a banalizzare. La sfida è rendere la complessità leggibile, non nasconderla.

4. **Fiducia attraverso la precisione** — i numeri devono sembrare assolutamente corretti: font monospaziato per valori, allineamento decimale, consistenza nei formati. L'utente deve sentire che può fidarsi dei dati.

5. **Personalità nei dettagli** — i momenti di piacere vengono dai dettagli: un counter che si anima, un grafico che si disegna in modo inaspettato, uno stato vuoto che racconta qualcosa. Non chiassosi, ma memorabili.

---

## Tech Stack Design Notes
- Tailwind v4 + shadcn/ui (stile "new-york"), base color neutral, OKLCH color space
- Breakpoint custom `desktop:` a 1440px (non usare `lg:`)
- Geist Sans (UI) + Geist Mono (valori numerici)
- Framer Motion già integrato — usare per animazioni avanzate
- Recharts (grafici) + @nivo/sankey
- Dark/light/system theme con CSS variables semantiche
