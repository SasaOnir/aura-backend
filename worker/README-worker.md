# Aura Mail Worker — Invio OTP via email per recupero password

Cloudflare Worker (gratuito, 100k richieste/giorno) che fa da **proxy sicuro** tra il frontend Aura (HTML pubblico su GitHub Pages) e Resend API. Tiene la chiave Resend come **secret** lato server — mai nel codice HTML.

## Flusso

```
[Utente nel browser]
    │ POST /request-otp { email }
    ▼
[Cloudflare Worker]  ──memorizza OTP in KV──>  ──chiama Resend──> [Email all'utente]
    ▲
    │ POST /verify-otp { email, code }
[Utente digita il codice a 6 cifre]
    ▼
Worker controlla KV → se OK, ritorna { ok: true } → HTML reimposta password
```

## 🚀 Deploy in 5 minuti

### Prerequisiti
- Account Cloudflare (gratis): https://dash.cloudflare.com/sign-up
- Node.js 18+ installato: https://nodejs.org

### Step 1 — Installa Wrangler
```bash
npm install -g wrangler
```

### Step 2 — Login a Cloudflare (una volta sola)
```bash
wrangler login
```
Si apre il browser → autorizza Cloudflare → torna al terminale.

### Step 3 — Posizionati nella cartella `worker/`
```bash
cd /home/z/my-project/scripts/aura-repo/worker
```

### Step 4 — Crea il KV namespace (storage per gli OTP)
```bash
wrangler kv:namespace create AURA_KV
```
Output tipo:
```
[[kv_namespaces]]
binding = "AURA_KV"
id = "abc123def456..."
```
**Copia l'id** e sostituisci `SOSTITUISCI_CON_L_ID_RESTITUITO_DA_WRANGLER` in `wrangler.toml` con l'id reale.

### Step 5 — Salva la chiave Resend come secret
```bash
wrangler secret put RESEND_API_KEY
```
Ti chiede di incollare il valore → incolla la tua chiave `re_...` → Enter. Wrangler la salva criptata su Cloudflare, **non appare da nessuna parte nel codice né in git**.

### Step 6 — Deploy
```bash
wrangler deploy
```
Output tipo:
```
Published aura-mail (1.23 sec)
  https://aura-mail.<tuo-username>.workers.dev
```
**Salva questo URL** — è il tuo endpoint.

### Step 7 — Aggiorna l'HTML con l'URL del Worker
Apri `/home/z/my-project/scripts/aura-repo/index.html` e cerca la riga:
```js
const AURA_MAIL_URL = ""; // ← da configurare
```
Sostituiscila con:
```js
const AURA_MAIL_URL = "https://aura-mail.<tuo-username>.workers.dev";
```

### Step 8 — Commit + push su GitHub
```bash
cd /home/z/my-project/scripts/aura-repo
git add -A
git commit -m "feat: recupero password via OTP email (Resend + Cloudflare Worker)"
git push
```

## 🧪 Test end-to-end

1. Apri https://sasaonir.github.io/aura-platform/#recover (dopo che Pages è attivo)
2. Inserisci email: `delivered@resend.dev`
3. Clicca "Invia codice" → vai su https://resend.com/emails → vedi l'email con il codice OTP
4. Inserisci il codice a 6 cifre + nuova password → "Reimposta password"
5. ✅ Login con la nuova password

## ⚠️ Limitazione modalità trial Resend

In trial, **Resend invia SOLO a `delivered@resend.dev`** (indirizzo di test ufficiale). Per mandare email a veri utenti (gmail, outlook, ecc.) devi:

1. Comprare un dominio (~10€/anno, es. Namecheap/Cloudflare)
2. Verificarlo su Resend: https://resend.com/domains → "Add domain" → inserisci i 3 record DNS
3. Modificare `worker/worker.js`:
   - Cambiare `EMAIL_FROM` da `"Aura <onboarding@resend.dev>"` a `"Aura <noreply@tuodominio.it>"`
   - **Cancellare** il blocco che limita a `TRIAL_ALLOWED_TO` (righe ~60-64)
4. `wrangler deploy` di nuovo

Tutto il resto del codice resta uguale.

## 🔒 Sicurezza

- ✅ Chiave Resend = **secret** Cloudflare (mai nel codice HTML, mai in git)
- ✅ OTP memorizzato in KV con **scadenza 10 min**
- ✅ **Rate-limit**: max 5 richieste / IP / 10 min (anti brute-force)
- ✅ OTP **uso singolo**: cancellato dopo verifica
- ✅ Massimo **5 tentativi** di verifica per OTP
- ✅ **CORS**: solo domini Aura possono chiamare il Worker
- ✅ Validazione email server-side
- ✅ OTP generato con `crypto.getRandomValues` (crittograficamente sicuro)

## 💰 Costi

- **Cloudflare Workers**: gratuito fino a 100k richieste/giorno. Per un'app come Aura è illimitato in pratica.
- **Cloudflare KV**: gratuito fino a 100k letture + 1k scritture/giorno. Illimitato per il recupero password.
- **Resend**: piano gratuito = 3.000 email/mese + 100/giorno. Per recupero password è abbondante.

## 🛠️ Comandi utili

```bash
# Log del Worker in tempo reale (per debug)
wrangler tail

# Modifica un secret
wrangler secret put RESEND_API_KEY

# Elimina un secret
wrangler secret delete RESEND_API_KEY

# Cancellare il Worker (se vuoi ricominciare)
wrangler delete
```

## 📁 Struttura file

```
worker/
├── worker.js        ← codice del Worker (proxy + OTP + KV)
├── wrangler.toml    ← config Cloudflare (KV id, nome worker)
└── README-worker.md ← questa guida
```
