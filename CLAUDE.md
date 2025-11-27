# CLAUDE.md - Portfolio Tracker

## Project Overview

**Portfolio Tracker** è un'applicazione web completa per il tracciamento e la gestione di portafogli di investimento multi-asset class, con funzionalità integrate di expense tracking, calcolatore FIRE (Financial Independence, Retire Early) e classifiche personali finanziarie.

### Scopo del Progetto
Sostituire la gestione dei portafogli basata su fogli di calcolo con una soluzione moderna e automatizzata, progettata specificamente per investitori italiani che utilizzano mercati europei.

### Caratteristiche Principali

**Gestione Portafoglio:**
- Supporto multi-asset class: Azioni, ETF, obbligazioni, crypto, immobili, commodities, cash, private equity
- Aggiornamento automatico dei prezzi da Yahoo Finance (100+ exchange mondiali)
- Tracking dell'allocazione degli asset con confronto target vs attuale
- Tracking del cost basis con calcolo delle plusvalenze non realizzate e stima tasse
- Tracking TER (Total Expense Ratio) per investimenti consapevoli dei costi
- Asset compositi per fondi pensione e investimenti ad allocazione mista

**Analisi Storica:**
- Snapshot mensili automatizzati tramite cron job schedulati
- Timeline del patrimonio netto con grafici interattivi
- Visualizzazione dell'evoluzione delle asset class nel tempo
- Confronto delle performance anno su anno
- Export CSV per analisi esterne

**Tracking Spese e Entrate:**
- Quattro tipi di voci: Entrate, Spese Fisse, Spese Variabili, Debiti
- Categorie personalizzate con sottocategorie e codifica colori
- Spese ricorrenti con generazione automatica mensile
- Sistema avanzato di filtri gerarchici (Tipo → Categoria → Sottocategoria)
- Analisi visive: grafici drill-down interattivi a tre livelli
- Metrica rapporto entrate/spese con indicatori di salute finanziaria

**Calcolatore e Tracker FIRE:**
- Configurazione Safe Withdrawal Rate (regola del 4% basata sul Trinity Study)
- Calcolatore FIRE Number (metodologia 25x spese annuali)
- Tracking dei progressi verso l'indipendenza finanziaria
- Simulazioni Monte Carlo per pianificazione pensionistica probabilistica
- Grafici di evoluzione storica di entrate, spese e prelievi sostenibili

**Hall of Fame:**
- Record finanziari personali di tutti i tempi
- Migliori/peggiori mesi per crescita patrimonio, entrate e spese (Top 20)
- Migliori/peggiori anni per performance annuale (Top 10)
- Aggiornamento automatico delle classifiche con ogni nuovo snapshot

**Localizzazione:**
- 🇮🇹 UI completamente in italiano
- Formato valuta EUR: €1.234,56
- Formato data italiano: DD/MM/YYYY
- Supporto per exchange europei (XETRA, Borsa Italiana, Euronext)

---

## Tech Stack

### Framework e Linguaggi
| Categoria | Tecnologia | Versione |
|-----------|-----------|----------|
| **Frontend Framework** | Next.js (App Router) | 16.0.1 |
| **Runtime** | React | 19.2.0 |
| **Linguaggio** | TypeScript | 5.x |
| **Styling** | Tailwind CSS | 4.x |
| **Componenti UI** | shadcn/ui | - |
| **Componenti Base** | Radix UI | - |

### Backend e Database
| Categoria | Tecnologia | Versione |
|-----------|-----------|----------|
| **Backend** | Next.js API Routes (serverless) | 16.0.1 |
| **Database** | Firebase Firestore (NoSQL) | - |
| **Authentication** | Firebase Authentication | 12.5.0 |
| **Admin SDK** | Firebase Admin | 13.6.0 |

### Librerie e Utilities
| Categoria | Tecnologia | Versione | Scopo |
|-----------|-----------|----------|-------|
| **Price Data** | yahoo-finance2 | 3.10.1 | API prezzi finanziari da Yahoo Finance |
| **Charts** | Recharts | 3.3.0 | Grafici interattivi e visualizzazioni |
| **Form Management** | react-hook-form | 7.66.0 | Gestione form |
| **Validation** | zod | 4.1.12 | Schema validation |
| **Date Utilities** | date-fns | 4.1.0 | Manipolazione date (locale italiano) |
| **Theming** | next-themes | 0.4.6 | Dark/light mode |
| **Icons** | lucide-react | 0.553.0 | Icon library |
| **Notifications** | sonner | 2.0.7 | Toast notifications |
| **Styling Utils** | clsx + tailwind-merge | - | Class name utilities |
| **CSS Variance** | class-variance-authority | 0.7.1 | Component variants |

### Deployment e Automazione
| Categoria | Tecnologia | Scopo |
|-----------|-----------|-------|
| **Hosting** | Vercel | Deployment automatico, serverless functions |
| **Cron Jobs** | Vercel Cron | Snapshot mensili automatici, aggiornamento prezzi |

### Scelte Architetturali

**Perché Next.js?**
- Framework React best-in-class con eccellente developer experience
- App Router per routing moderno e server components
- API Routes per backend serverless senza infrastruttura separata

**Perché Firebase?**
- Tier gratuito generoso
- Aggiornamenti real-time
- Autenticazione facile senza gestione server
- Firestore Security Rules per autorizzazione lato server

**Perché Yahoo Finance?**
- API gratuita senza chiave richiesta
- Affidabile con copertura estesa di ticker (a differenza delle API a pagamento)
- Supporto per 100+ exchange mondiali

**Perché Vercel?**
- Integrazione seamless con Next.js
- Deploy automatici da Git
- Cron jobs integrati per automazione

**Perché TypeScript?**
- Type safety previene bug
- Migliora maintainability e developer experience
- Autocomplete e refactoring sicuri

---

## Project Structure

```
net-worth-tracker/
├── app/                      # Next.js App Router
│   ├── api/                  # API Routes (serverless functions)
│   │   ├── cron/             # Cron job endpoints (snapshot mensili)
│   │   ├── prices/           # Endpoint aggiornamento prezzi asset
│   │   ├── auth/             # Endpoint autenticazione
│   │   └── ...               # Altri endpoint API
│   ├── dashboard/            # Pagine dashboard (protected routes)
│   │   ├── patrimonio/       # Gestione asset e portafoglio
│   │   ├── cashflow/         # Tracking spese e entrate
│   │   ├── fire/             # Calcolatore FIRE e simulazioni
│   │   ├── allocazione/      # Asset allocation e rebalancing
│   │   ├── storico/          # Analisi storica e performance
│   │   ├── hall-of-fame/     # Classifiche record personali
│   │   └── settings/         # Impostazioni e configurazione
│   ├── login/                # Pagina login
│   ├── register/             # Pagina registrazione
│   ├── layout.tsx            # Root layout (auth provider, themes)
│   ├── page.tsx              # Homepage/landing
│   └── globals.css           # Global styles (Tailwind)
│
├── components/               # React components riutilizzabili
│   ├── ui/                   # shadcn/ui components (Button, Dialog, etc.)
│   ├── auth/                 # Componenti autenticazione
│   ├── dashboard/            # Componenti specifici dashboard
│   ├── charts/               # Chart components (Recharts wrappers)
│   └── ...                   # Altri componenti shared
│
├── contexts/                 # React Contexts
│   └── AuthContext.tsx       # Context autenticazione Firebase
│
├── lib/                      # Librerie e utilities
│   ├── firebase/             # Configurazione Firebase (client + admin)
│   ├── services/             # Business logic services
│   │   ├── yahooFinanceService.ts  # API Yahoo Finance
│   │   ├── assetService.ts         # CRUD asset
│   │   └── ...                     # Altri services
│   └── utils/                # Utility functions
│
├── types/                    # TypeScript type definitions
│   ├── asset.ts              # Tipi asset e portafoglio
│   ├── expense.ts            # Tipi spese e entrate
│   └── ...                   # Altri types
│
├── public/                   # Static assets (immagini, favicon)
│
├── firestore.rules           # Firestore Security Rules
├── firestore.indexes.json    # Firestore database indexes
├── vercel.json               # Configurazione Vercel (cron jobs)
├── next.config.ts            # Configurazione Next.js
├── tsconfig.json             # Configurazione TypeScript
├── package.json              # Dependencies e scripts
├── .env.local.example        # Template variabili ambiente
├── README.md                 # Documentazione progetto
├── SETUP.md                  # Guida setup e deployment
└── VERCEL_SETUP.md           # Troubleshooting Vercel + Firebase
```

### Directory Principali

**app/** - Next.js App Router
- Routing basato su filesystem
- Server Components di default
- API Routes in `app/api/`
- Layout annidati per struttura UI condivisa

**components/** - Componenti React riutilizzabili
- `ui/` contiene componenti shadcn/ui (design system)
- Componenti organizzati per feature/dominio
- Componenti presentazionali separati da business logic

**lib/** - Business logic e utilities
- `firebase/` gestisce connessioni client e admin SDK
- `services/` contiene tutta la business logic (CRUD, API esterne)
- `utils/` per helper functions generiche

**types/** - TypeScript definitions
- Types condivisi per entità del dominio
- Interfacce per API responses
- Type guards e utility types

**contexts/** - React Context providers
- AuthContext per stato autenticazione globale
- Pattern: Context + Provider + custom hook

### Pattern Architetturali

**Separation of Concerns:**
- Componenti UI in `components/`
- Business logic in `lib/services/`
- Type definitions in `types/`
- API routes in `app/api/`

**Data Flow:**
1. UI Components chiamano services
2. Services interagiscono con Firebase/API esterne
3. Services ritornano typed data
4. Components renderizzano dati

**Authentication Flow:**
1. Firebase Auth tramite AuthContext
2. Protected routes verificano auth in layout
3. Firestore Rules autorizzano operazioni lato server
4. API routes validano CRON_SECRET per automazione

---

*Documento generato automaticamente - Versione 1.0*
