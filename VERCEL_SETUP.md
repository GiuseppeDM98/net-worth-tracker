# Configurazione Firebase su Vercel

Questa guida spiega come configurare correttamente le credenziali Firebase Admin SDK su Vercel per risolvere l'errore "DECODER routines::unsupported".

## Problema

Quando si usa Firebase Admin SDK su Vercel con variabili d'ambiente separate (`FIREBASE_ADMIN_PROJECT_ID`, `FIREBASE_ADMIN_CLIENT_EMAIL`, `FIREBASE_ADMIN_PRIVATE_KEY`), potresti incontrare errori di decodifica delle credenziali come:

```
Error: 2 UNKNOWN: Getting metadata from plugin failed with error: error:1E08010C:DECODER routines::unsupported
```

Questo accade perché i caratteri speciali nella chiave privata (in particolare i newline `\n`) possono essere gestiti in modo diverso su Vercel rispetto all'ambiente locale.

## Soluzione Raccomandata: Usa Service Account JSON Completo

### Passo 1: Ottieni il Service Account JSON da Firebase

1. Vai alla [Firebase Console](https://console.firebase.google.com/)
2. Seleziona il tuo progetto
3. Vai su **Impostazioni progetto** (icona ingranaggio) → **Account di servizio**
4. Clicca su **Genera nuova chiave privata**
5. Scarica il file JSON (es: `your-project-firebase-adminsdk.json`)

### Passo 2: Configura la Variabile d'Ambiente su Vercel

1. Vai al tuo progetto su [Vercel Dashboard](https://vercel.com/dashboard)
2. Vai su **Settings** → **Environment Variables**
3. Aggiungi una nuova variabile:
   - **Nome**: `FIREBASE_SERVICE_ACCOUNT_KEY`
   - **Valore**: Copia e incolla **l'intero contenuto** del file JSON scaricato
   - Il valore dovrebbe assomigliare a questo:
     ```json
     {"type":"service_account","project_id":"your-project-id","private_key_id":"...","private_key":"-----BEGIN PRIVATE KEY-----\n...","client_email":"...","client_id":"...","auth_uri":"...","token_uri":"...","auth_provider_x509_cert_url":"...","client_x509_cert_url":"..."}
     ```
   - **Environment**: Seleziona Production, Preview, e Development
4. Clicca su **Save**

### Passo 3: Redeploy

1. Vai alla tab **Deployments**
2. Clicca sui tre puntini del deployment più recente
3. Seleziona **Redeploy**
4. Conferma il redeploy

## Soluzione Alternativa: Usa Variabili Separate (Solo per Local Development)

Se preferisci usare variabili d'ambiente separate per lo sviluppo locale, assicurati di:

1. Aggiungere le seguenti variabili nel tuo `.env.local`:
   ```env
   FIREBASE_ADMIN_PROJECT_ID=your_project_id
   FIREBASE_ADMIN_CLIENT_EMAIL=your_service_account_email@your-project.iam.gserviceaccount.com
   FIREBASE_ADMIN_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYour private key here\n-----END PRIVATE KEY-----\n"
   ```

2. **IMPORTANTE**: La `FIREBASE_ADMIN_PRIVATE_KEY` deve includere:
   - Le virgolette doppie all'inizio e alla fine
   - I caratteri `\n` letterali (non newline veri)
   - L'intera chiave privata tra `-----BEGIN PRIVATE KEY-----` e `-----END PRIVATE KEY-----`

## Verifica della Configurazione

Dopo aver configurato le variabili d'ambiente e fatto il redeploy:

1. Prova la funzionalità "Aggiorna Prezzi" dalla tua app deployata
2. Prova la funzionalità "Crea Snapshot"
3. Controlla i log su Vercel (Deployments → Seleziona il deployment → Functions) per eventuali errori

## Altre Variabili d'Ambiente Necessarie

Non dimenticare di configurare anche:

```env
# Firebase Client (pubbliche, possono essere visibili)
NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id

# Cron Job Secret (per proteggere gli endpoint scheduled)
CRON_SECRET=your_secure_random_string

# App URL
NEXT_PUBLIC_APP_URL=https://your-app.vercel.app
```

## Troubleshooting

### L'errore persiste dopo il redeploy

1. Verifica che la variabile `FIREBASE_SERVICE_ACCOUNT_KEY` contenga un JSON valido
2. Assicurati che il JSON non abbia spazi o newline aggiuntivi
3. Verifica che tutte le environment variables siano configurate per Production
4. Prova a rimuovere le vecchie variabili `FIREBASE_ADMIN_*` per evitare conflitti

### Come verificare che il JSON sia valido

Puoi usare [jsonlint.com](https://jsonlint.com/) per verificare che il JSON sia formattato correttamente.

### Errore "Firebase Admin credentials not found"

Questo significa che né `FIREBASE_SERVICE_ACCOUNT_KEY` né le variabili individuali sono configurate. Segui i passi sopra per configurare almeno una delle due opzioni.

## Sicurezza

⚠️ **IMPORTANTE**:
- Non committare mai il file JSON del service account nel repository
- Non condividere mai le credenziali Firebase pubblicamente
- Usa sempre variabili d'ambiente per le credenziali sensibili
- Il file `firebase-adminsdk-*.json` dovrebbe essere aggiunto al `.gitignore`
