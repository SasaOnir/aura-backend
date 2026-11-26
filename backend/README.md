# Aura — Backend

NestJS + TypeScript + Prisma + PostgreSQL + Redis. Implementa Fase 1 del PRD: **Core e Aura Control** (auth, account, ruoli, audit log, dashboard Super Admin).

## Moduli implementati (Fase 1)

| Modulo | Stato | Descrizione |
|--------|-------|-------------|
| `auth`     | ✅ reale | Registrazione, login (JWT access + refresh), refresh token rotation, logout, hash argon2id |
| `users`    | ✅ reale | Profilo, suspends/reactivates (richiede permesso), esportazione dati (GDPR art.20), cancellazione (GDPR art.17) |
| `roles`    | ✅ reale | CRUD ruoli (no DELETE su `super_admin`), assegnazione permessi, `is_protected` enforced server-side |
| `staff`    | ✅ reale | Invito collaboratori, assegnazione ruoli, revoca accessi, imposizione MFA |
| `audit`    | ✅ reale | Scrittura automatica su ogni endpoint protetto, consultazione (read-only, filtro per permesso) |
| `admin`    | ✅ reale | Dashboard Super Admin: KPI globali, lista utenti, lista collaboratori, audit log |
| `bootstrap`| ✅ reale | Al primo avvio crea il Super Admin da env (`AURA_SUPERADMIN_*`) — una sola volta |

## Moduli "stub" (presenti come placeholder, NON implementati)

I seguenti sono inclusi come scaffold vuoto con un endpoint `/health` che ritorna `{status:'not_implemented', phase:'Fase N'}`. Il frontend li nasconde quando l'API risponde così.

| Modulo | Fase PRD | Stato |
|--------|----------|-------|
| `catalog` (artisti, release, tracks)      | Fase 2 | stub |
| `media` (upload, S3, FFmpeg)               | Fase 2 | stub |
| `playback`, `playlists`                    | Fase 3 | stub |
| `subscriptions`, `payments`, `royalty`      | Fase 4 | stub |
| `distribution` (Distribution Adapter)     | Fase 5 | stub |
| `moderation`, `support`                    | Fase 6 | stub |
| `analytics`                                | Fase 6 | stub |

> **Onestà:** il PRD §18 dice "Una schermata HTML con pulsanti dimostrativi non equivale a una funzione completata". I moduli stub non fanno finta di funzionare: ritornano esplicitamente `not_implemented`.

## Sicurezza implementata (PRD §15)

- ✅ Password con **argon2id** (non bcrypt) — `@node-rs/argon2`
- ✅ JWT access (15 min) + refresh (30gg) con **rotation** e revoca
- ✅ **Permessi enforced lato server** via `@RequirePermissions('users.suspend')` guard
- ✅ `super_admin` è `is_protected`: nessun endpoint può cancellarlo o modificarne i permessi
- ✅ Audit log automatico su ogni azione sensibile (decoratore `@Audit`)
- ✅ Rate-limit su auth (5 req / IP / 15 min) via Redis
- ✅ CORS restrictivo (solo `CORS_ORIGIN` da env)
- ✅ Helmet headers (CSRF, XSS protection, no-sniff, etc.)
- ✅ Validazione class-validator su tutti i DTO

## Stack

```
NestJS 10 · TypeScript 5  · Prisma 5 (PostgreSQL)
node-rs/argon2 · @nestjs/jwt · passport-jwt
ioredis · bullmq · helmet · class-validator
```

## Avvio rapido

```bash
cd /home/z/my-project/scripts/aura-repo
cp .env.example .env                  # personalizza JWT secrets + Super Admin
docker compose up -d                  # db + redis + minio + backend + frontend
docker compose logs -f backend        # segui l'avvio + bootstrap Super Admin
```

Primo avvio: il backend legge `AURA_SUPERADMIN_*` e crea il Super Admin (una sola volta). Poi ignora quelle env.

## Sviluppo locale (senza Docker)

```bash
cd backend
pnpm install
pnpm prisma:generate
pnpm prisma:migrate dev
pnpm start:dev
```

## Endpoint principali (Fase 1)

```
POST   /auth/register                 # pubblico
POST   /auth/login                    # pubblico
POST   /auth/refresh                  # pubblico (con refresh token)
POST   /auth/logout                   # autenticato
GET    /auth/me                       # autenticato

GET    /users                          # users.read
GET    /users/:id                     # users.read
PATCH  /users/:id/suspend             # users.suspend
PATCH  /users/:id/reactivate          # users.suspend
GET    /users/:id/export              # users.export  (GDPR art.20)
DELETE /users/:id                     # users.delete   (GDPR art.17)

GET    /roles                         # roles.read
POST   /roles                         # roles.create
PATCH  /roles/:id                     # roles.update
DELETE /roles/:id                     # roles.delete   (no super_admin)

POST   /staff/invite                  # staff.invite
POST   /staff/:userId/assign-role     # staff.invite
PATCH  /staff/:userId/revoke          # staff.revoke
PATCH  /staff/:userId/require-mfa     # staff.require_mfa

GET    /admin/dashboard               # analytics.global
GET    /admin/users                   # users.read
GET    /admin/audit-logs              # audit.read
```

## Test

```bash
pnpm test         # unit
pnpm test:e2e     # end-to-end (avvia DB di test isolato)
```

## License

Proprietary — Aura. Vedi README root.
