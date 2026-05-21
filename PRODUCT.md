# Impeccable Design Context — Net Worth Tracker

## Design Context

### Users
Investitori italiani attenti e autonomi che gestiscono in proprio il loro patrimonio — azioni, ETF, BTP, crypto, immobili, conti correnti. Usano l'app regolarmente (almeno mensile) per monitorare performance, dividendi e progresso verso FIRE. Non sono trader: sono accumulatori di lungo periodo, metodici, che vogliono dati affidabili e leggibili senza perdere tempo.

**Job to be done**: "Capire in pochi secondi com'è messa la mia situazione finanziaria, confrontarla col passato, e sentire che sto andando nella giusta direzione."

### Brand Personality
**Elegante · Sofisticato · Personale**

L'app non è uno strumento impersonale: è un cruscotto privato, quasi un diario finanziario di qualità. Come un wealth manager digitale su misura — non parla a tutti, parla a te. La sofisticazione si esprime nella cura per i dettagli, non nella complessità.

### Aesthetic Direction

**Riferimento primario — Linear / Vercel**: tipografia forte, dark mode eccellente, geometria pulita, microinterazioni fluide, nessun decoro superfluo. La struttura, il ritmo, la pulizia.

**Riferimento primario — Trade Republic**: gerarchia numerica estrema. Il dato primario occupa il massimo spazio fisico e visivo disponibile. Layout verticale netto: numero dominante → variazione chip inline → metadati in label piccole. Liste flat con `divide-y` invece di card-dentro-card. Nessun progress bar decorativo. Nessuna box-within-box. Il chrome visivo è ridotto al minimo strutturale — solo ciò che separa, mai ciò che decora.

I due riferimenti sono complementari: condividono dark mode premium, tipografia come struttura, zero decorazione, rispetto per il dato come protagonista assoluto.

**Visual tone**: Ultra-clean con personalità. Spazio intenzionale. Gerarchia tipografica netta. Dati che respirano. Animazioni che informano, non intrattengono.

**Direzione**: Overdrive — implementazioni tecnicamente ambiziose che fanno alzare il sopracciglio. Fisica spring su dialog, scroll-driven reveals, counter animati, transizioni che sembrano impossibili per una web app.

**Anti-riferimenti**: Bloomberg terminal (troppo freddo/denso), consumer fintech colorato alla Revolut (troppo leggero per dati seri), Material Design (troppo generico).

**Tema**: Dark mode come esperienza primaria. Light mode pienamente supportata.

### Design Principles

1. **Dati prima, chrome mai** — ogni elemento visivo guadagna il suo spazio comunicando un'informazione. Se togliendolo la pagina è più chiara, va tolto. Box decorative, progress bar estetiche, divisori ridondanti: fuori.

2. **Il numero comanda** — il dato primario di ogni schermata occupa il massimo spazio fisico e visivo disponibile. Gerarchia Trade Republic: valore in `text-2xl font-bold font-mono` (o più grande), variazione come chip compatto inline, tutto il resto come label/metadato. L'utente capisce il numero più importante in meno di 2 secondi, senza cercare.

3. **Sezioni che respirano** — la densità è una feature, ma solo se leggibile. Padding generoso tra sezioni. Separatori `divide-y` invece di nested card. Liste piatte invece di griglie di box. Lo spazio bianco è strutturale, non decorativo.

4. **Mobile-first, desktop-elevated** — il layout base è progettato per 390px. Il desktop aggiunge colonne, tabelle e sidebar — non è una versione semplificata di un layout desktop. Il breakpoint primario è `desktop:` (1440px). Mai `lg:` per layout wide-screen (iPad Mini in landscape = 1024px, trattato come mobile per design).

5. **Movimento con intenzione** — le animazioni rivelano struttura e relazioni, non distraggono. Fisica spring come standard (stiffness 400, damping 35). Rispetta sempre `prefers-reduced-motion` via `useReducedMotion()`.

6. **Fiducia attraverso la precisione** — font monospaziato per valori (`font-mono` + `tnum`), allineamento decimale, consistenza nei formati. Il dato deve sembrare assolutamente affidabile.

7. **Personalità nei dettagli** — i momenti di piacere vengono dai dettagli: counter animati, sparkline per-asset, stati vuoti che raccontano qualcosa. Non chiassosi, ma memorabili.

---

## Tech Stack Design Notes
- Tailwind v4 + shadcn/ui (stile "new-york"), base color neutral, OKLCH color space
- Breakpoint custom `desktop:` a 1440px (non usare `lg:`)
- Geist Sans (UI) + Geist Mono (valori numerici)
- Framer Motion già integrato — usare per animazioni avanzate
- Recharts (grafici) + @nivo/sankey
- Dark/light/system theme con CSS variables semantiche
