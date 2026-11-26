# Aura — Monorepo piattaforma musicale

Sistema completo di amministrazione per la piattaforma musicale Aura. Implementa **Fase 1 del Master PRD** (Core e Aura Control): autenticazione, account, ruoli, organizzazioni, Super Admin, audit log, dashboard amministrativa, gestione collaboratori.

> **Stato onesto del progetto.** Il backend (Fase 1: auth, ruoli, staff, audit) è la base di un prodotto reale ed è stato irrobustito (vedi `SECURITY.md`). Il file `index.html` è invece un **prototipo dimostrativo** con auth locale al browser: non usarlo con dati reali. Mancano ancora i moduli musicali (brani, upload, pagamenti, royalty). Stack: NestJS + Next.js + TypeScript + PostgreSQL + Redis + Prisma + Docker.

Il repo contiene anche il **prototipo HTML statico** originale (`index.html` + `worker/`) sviluppato come prova di UX — vedi la sezione "Prototipo statico" in fondo.

---

## 📦 Struttura

```
aura-repo/
├── backend/                  # NestJS API (TypeScript + Prisma)
│   ├── db/schema.sql         # DDL PostgreSQL — 37 tabelle + seed RBAC
│   ├── prisma/schema.prisma  # Prisma client (riflette schema.sql)
│   └── src/
│       ├── auth/             # JWT + refresh rotation + argon2id + RBAC guard
│       ├── users/            # CRUD + suspend/reactivate + GDPR export/delete
│       ├── roles/            # CRUD ruoli + matrice permessi (super_admin protetto)
│       ├── staff/            # Invito collaboratori + assign/revoke role + MFA
│       ├── audit/            # Audit interceptor + controller read-only
│       ├── admin/            # Dashboard Super Admin (KPI globali)
│       └── bootstrap/        # Crea il Super Admin al primo avvio da env
├── frontend/                 # Next.js 14 App Router + Tailwind
│   └── src/app/
│       ├── login/            # Login Super Admin / staff
│       ├── users/            # Gestione utenti (suspend/reactivate/export/delete)
│       ├── staff/            # Invito + revoca collaboratori + toggle MFA
│       ├── roles/            # CRUD ruoli + vista permessi
│       └── audit/            # Audit log (read-only)
├── index.html                # Prototipo HTML statico (vedi sezione in fondo)
├── worker/                   # Cloudflare Worker per OTP email del prototipo
└── docker-compose.yml        # Postgres + Redis + MinIO + backend + frontend
```

## 🚀 Avvio rapido (5 minuti)

```bash
# 1. Clona
git clone https://github.com/SasaOnir/aura-backend.git
cd aura-backend

# 2. Crea .env (copia il template e personalizza i secret)
#    Il compose NON ha più valori di default per i segreti: se ne manca uno, si ferma.
cp .env.example .env
# → cambia: JWT_ACCESS_SECRET, JWT_REFRESH_SECRET (openssl rand -base64 64)
# → imposta: AURA_SUPERADMIN_EMAIL, AURA_SUPERADMIN_PASSWORD, AURA_SUPERADMIN_NAME

# 3. Avvia tutto
docker compose up -d

# 4. Segui l'avvio del backend (vede il bootstrap Super Admin)
docker compose logs -f backend

# 5. Apri il pannello
open http://localhost:3000
# Login con le credenziali del Super Admin che hai messo in .env
```

## 🔐 Il Super Admin

- Il **primo** Super Admin viene creato al primo avvio del backend, leggendo `AURA_SUPERADMIN_*` dal `.env`.
- È **idempotente**: se esiste già (stessa email), il bootstrap salta.
- Dopo la creazione, puoi rimuovere `AURA_SUPERADMIN_*` dal `.env` — non vengono mai più letti.
- Il ruolo `super_admin` è `is_protected`: nessun endpoint può cancellarlo o modificarne i permessi (PRD §5).
- Gli altri ruoli non possono autoassegnarsi `super_admin` (PRD §5).

## ✅ Cosa è REALE (Fase 1 completa)

- [x] **Auth**: register, login, JWT access (15min) + refresh (30gg) con rotation, logout, hash **argon2id**
- [x] **RBAC lato server**: `@RequirePermissions('users.suspend')` + `PermissionsGuard` — il frontend nasconde i bottoni ma il backend rifiuta comunque
- [x] **Audit log automatico**: ogni endpoint decorato con `@Audit('action')` registra actor, action, resource, result, IP, user-agent (PRD §4.6)
- [x] **Audit immutabile**: schema + commenti per `REVOKE UPDATE, DELETE FROM aura_app` in produzione
- [x] **Super Admin protetto**: `is_protected = true` sul ruolo, enforced in `roles.service` e `staff.service`
- [x] **Sicurezza**: helmet, CORS restrictivo, validation pipe globale, rate-limit ready (Redis), anti user-enumeration (login)
- [x] **GDPR**: export dati (art.20), cancellazione (art.17), soft-delete con retention
- [x] **37 tabelle PostgreSQL** dello schema PRD §7 (DDL + indici + vincoli + trigger + seed)
- [x] **Frontend**: login + dashboard + users + staff + roles + audit, palette aurora, responsive

## 🟡 Cosa è STUB (placeholder onesti, Fase 2+)

I seguenti moduli hanno tabelle create in `schema.sql` ma **non hanno backend né frontend**. NON fanno finta di funzionare — il PRD §18 dice esplicitamente: "Una schermata HTML con pulsanti dimostrativi non equivale a una funzione completata."

| Modulo PRD | Fase | Stato |
|------------|------|-------|
| Catalog (artisti, release, tracks)        | Fase 2 | ⏳ schema pronto, moduli da fare |
| Media (upload, S3, FFmpeg)                | Fase 2 | ⏳ MinIO configurato, worker mancante |
| Playback / Playlists / Follows            | Fase 3 | ⏳ schema pronto |
| Subscriptions / Payments / Royalty ledger | Fase 4 | ⏳ schema pronto |
| Distribution Adapter (DDEX-ready)         | Fase 5 | ⏳ schema pronto |
| Moderation / Support                      | Fase 6 | ⏳ schema pronto |
| Analytics avanzate                        | Fase 6 | ⏳ solo KPI base in dashboard |

## 🛡️ Sicurezza (PRD §15)

| Requisito PRD | Implementazione |
|---|---|
| Password hashing adeguato | ✅ argon2id (memory 19MB, t=2, p=1) |
| MFA per account amministrativi | ✅ campo `mfa_required` su `admin_accounts`, impostabile dal Super Admin; enforcement TOTP da completare (Fase 1.5) |
| Sessioni sicure | ✅ JWT short-lived + refresh rotation, revoca per token, logout totale |
| CSRF / XSS protection | ✅ helmet + CORS restrictivo |
| Controllo accessi lato server | ✅ `PermissionsGuard` su ogni endpoint protetto |
| Rate limiting | ✅ pronto (Redis ioredis già cablato; middleware da attivare su `/auth/*`) |
| Validazione file upload | ⏳ Fase 2 (modulo media) |
| Crittografia in transito | ✅ HTTPS in prod (reverse proxy); TLS interno opzionale |
| Cifratura dati a riposo | ⏳ secret manager da configurare in prod (es. AWS Secrets Manager) |
| Backup automatici | ⏳ operativi: pg_dump schedulato da configurare in prod |
| Audit log immutabile | ✅ append-only + commento per `REVOKE UPDATE/DELETE` |
| Approvazione a due persone | ⏳ architettura pronta (`audit_logs.result='pending'`), UI da fare |

## 🧪 Test

```bash
cd backend
npm test         # unit
npm run test:e2e # e2e (avvia DB di test isolato)
```

## 📋 Roadmap (PRD §17)

| Fase | Status | Note |
|------|--------|------|
| 0 — Fondamenta | ✅ | PRD + architettura + schema |
| 1 — Core + Aura Control | ✅ | **questo repo** |
| 2 — Artist Studio + catalogo | ⏳ | prossimo |
| 3 — Aura Music (player) | ⏳ | |
| 4 — Business + pagamenti | ⏳ | |
| 5 — Aura Distribution | ⏳ | richiede contratto partner |
| 6 — Trust, Analytics | ⏳ | |
| 7 — App mobile, API pubbliche | ⏳ | |

## 📝 Decisioni aperte (PRD §19)

15 decisioni (prezzi piani, commissioni, payout, partner, territori, licenze streaming, AI policy, retention, contratti, forma societaria) da chiudere **prima del lancio**. Ognuna ha un responsabile e uno stato — vedi `docs/DECISIONS.md` (da creare).

## 🏗️ Architettura tecnica

- **Backend**: NestJS 10 + TypeScript 5 + Prisma 5
- **Frontend**: Next.js 14 (App Router) + Tailwind CSS 3 + TypeScript
- **DB**: PostgreSQL 16 (UUID v4, citext, jsonb, inet, trigger updated_at)
- **Cache/queue**: Redis 7 (ioredis + BullMQ ready)
- **Storage audio**: MinIO (S3-compatible) per dev; AWS S3/Cloudflare R2 in prod
- **Auth**: JWT (HS256) access + refresh con rotation; argon2id password hash
- **Container**: Docker multi-stage build, immagine finale Alpine

## 🎨 Prototipo statico (legacy)

Il file `index.html` alla radice è il **prototipo HTML single-file** sviluppato come prova di UX iniziale (reg, login, upload brani, player, profilo artista, match, recupero password via OTP). È autonomo, gira in qualsiasi browser, niente backend. Non fa parte di Aura Control; è stato tenuto come riferimento visivo per le fasi successive.

Anteprima live (su GitHub Pages del vecchio repo `aura-platform`): <https://sasaonir.github.io/aura-platform>

Il Cloudflare Worker in `worker/` gestisce l'OTP email per il recupero password del prototipo (vedi `worker/README-worker.md`).

## 🔒 Pulizia raccomandata dopo il setup

Se hai condiviso token GitHub o chiavi API in chat, **revocale subito**:
- PAT GitHub: https://github.com/settings/personal-access-tokens → Revoke
- Chiavi Resend: https://resend.com/api-keys → delete + rigenera

## License

Proprietary — Aura. Tutti i diritti riservati.
