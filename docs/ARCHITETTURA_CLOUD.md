# Architettura Cloud di Aura

Questo documento descrive la destinazione cloud di ciascun componente di Aura
e perché il backend NestJS **non** viene deployato su Netlify Functions.

## Panoramica

```
┌─────────────────────────────┐      ┌─────────────────────────────┐
│  Frontend Next.js 14        │      │  Backend NestJS             │
│  (App Router, standalone)   │      │  (long-lived process)       │
│  → Netlify (Edge/CDN)      │ ──→ │  → Fly.io / Railway / VPS   │
│  https://aura-frontend      │ /api │  https://api.aura....        │
└─────────────────────────────┘      └─────────────────────────────┘
                                              │
                                              ▼
                                     ┌───────────────────┐
                                     │  Neon PostgreSQL  │
                                     │  branch: production │
                                     └───────────────────┘
                                              │
                                              ▼
                                     ┌───────────────────┐
                                     │  Storage audio    │
                                     │  S3-compatibile   │
                                     │  (R2/B2/Supabase) │
                                     └───────────────────┘
```

## 1. Frontend → Netlify

**Perché Netlify è adatto al frontend:**
- Next.js 14 con App Router è supportato nativamente da Netlify tramite il
  plugin ufficiale `@netlify/plugin-nextjs` (installato automaticamente al
  primo deploy quando Netlify rileva `next` in `package.json`).
- Le 7 pagine attuali (`/`, `/login`, `/users`, `/roles`, `/staff`, `/audit`,
  `/_not-found`) sono tutte prerenderizzate staticamente (vedi output di
  `next build`): il costo di runtime su Netlify è minimo.
- Deploy preview automatici per ogni PR e per ogni branch non-main, con URL
  univoco per testare le modifiche prima del merge.
- CDN globale inclusa nel piano Free.

**Configurazione:** vedi `netlify.toml` nella root del repository.

## 2. Backend → container dedicato (NON Netlify Functions)

**Perché il backend NestJS NON va su Netlify Functions:**

Il backend di Aura è un'applicazione NestJS monolitica con caratteristiche
che richiedono un **processo long-lived**, incompatibili con il modello
serverless di Netlify Functions (dove ogni invocazione è un contesto
effimero, freddo, senza stato condiviso tra richieste):

1. **Bootstrap Super Admin idempotente all'avvio** (`main.ts`): il processo
   esegue `SuperAdminBootstrap.run()` una sola volta al boot per creare il
   Super Admin iniziale. In serverless questo verrebbe rieseguito a ogni
   cold start, o non verrebbe eseguito affatto (le Functions non hanno un
   hook "on boot" del processo).

2. **JWT refresh token rotation** con `RefreshToken` in DB (`auth.service.ts`):
   la rotazione usa `replacedById` per invalidare il refresh token precedente.
   Funziona con un client Prisma long-lived che mantiene il pool di
   connessioni al DB; in serverless ogni invocazione aprirebbe e chiuderebbe
   una connessione, invalidando i vantaggi del pooling.

3. **AuditInterceptor globale**: ogni richiesta decorata con `@Audit(...)`
   scrive su `audit_logs` dopo l'esecuzione. L'interceptor è registrato con
   `@UseInterceptors(AuditInterceptor)` sui controller admin; in serverless
   Nest gli interceptor funzionano, ma il pattern richiede che l'app Nest
   sia inizializzata — e in Functions l'app viene ricreata a ogni cold start.

4. **Connessione a Neon via Prisma Client con pool**: Prisma raccomanda
   esplicitamente il pooling per applicazioni long-lived. In serverless
   servirebbe il Neon **pooled connection string** (porta `-pooler`), ma anche
   così il pattern di Nest (singleton `PrismaService`) non è ottimale in
   Functions.

5. **`ioredis` come dipendenza dichiarata** (`package.json`): anche se non
   ancora attivo nel codice, il PRD prevede cache + rate-limit via Redis in
   Fase 2. Netlify Functions non ha accesso diretto a un'istanza Redis
   dedicata long-lived.

6. **Health endpoint + Docker healthcheck** (`main.ts` espone `/health`):
   pensato per un orchestratore di container (Fly.io, Railway, ECS), non
   per Functions.

**Destinazione consigliata (free-tier o economico):**

| Servizio    | Free tier                     | Adatto a NestJS | Note                          |
|-------------|-------------------------------|----------------|-------------------------------|
| Fly.io      | 3 VM shared-cpu-256MB gratis | ✅             | Docker nativo, deploy dal repo |
| Railway     | $5 credito/mese (trial)       | ✅             | UI semplice, non permanent free |
| Render       | 1 web service free (sleep)    | ✅             | Sleep dopo 15min inattivi     |
| Koyeb       | 1 nano service free           | ✅             | Auto-scale, no sleep          |

**Raccomandazione: Fly.io** — è il più adatto perché:
- Ha un vero free tier persistente (3 micro-VM shared, 256MB RAM ciascuna),
  sufficiente per un backend NestJS in Fase 1.
- Deploy diretto da Dockerfile (il backend ha già `backend/Dockerfile` pronto).
- Supporta le env vars e i secrets in modo sicuro.
- Regione EU disponibile (compatibile con RGPD).

**Configurazione minima Fly.io (futura, quando l'utente autorizzerà):**
```toml
# fly.toml (da creare in backend/ al momento del deploy)
app = "aura-backend"
[build]
  dockerfile = "Dockerfile"
[env]
  PORT = "4000"
  NODE_ENV = "production"
  CORS_ORIGIN = "https://aura-frontend.netlify.app"
[[services]]
  internal_port = 4000
  protocol = "tcp"
  [[services.ports]]
    handlers = ["http"]
    port = 80
  [[services.ports]]
    handlers = ["tls", "http"]
    port = 443
```

## 3. Database → Neon PostgreSQL

- Branch di produzione: `production` (project `snowy-frog-35530926`).
- Schema SQL sorgente di verità: `backend/db/schema.sql` (applicato via
  init-script di Postgres in dev; in Neon va applicato una sola volta via
  `psql` o query della console Neon).
- Prisma è usato come **client tipato**, non come gestore di migrazioni:
  `backend/prisma/schema.prisma` ha solo `schema.prisma`, nessuna migration
  in `prisma/migrations/`.
- Lo schema Prisma legge `DATABASE_URL` da env. In produzione (Neon) questa
  variabile contiene la connection string pooled di Neon.

**Da fare (BLOCKED sull'utente):** l'utente deve fornire la connection string
Neon (mascherando la password) per:
- popolare `DATABASE_URL` nel backend;
- applicare `schema.sql` al branch `production` di Neon;
- verificare la connessione dal backend.

## 4. Storage audio → S3-compatible esterno

Vedi `docs/STORAGE_MUSICALE.md` per la valutazione comparata.

## 5. Worker Cloudflare (recupero password via OTP)

Il worker in `worker/` gestisce l'invio dell'OTP email via Resend ed è già
configurato per Cloudflare Workers (`wrangler.toml` presente). Resta su
Cloudflare — è indipendente da Netlify e dal backend NestJS.
