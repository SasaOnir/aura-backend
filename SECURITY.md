# Sicurezza — Aura

## Segnalare una vulnerabilità
Scrivi in privato al proprietario del progetto (non aprire issue pubbliche). Rispondiamo entro 72 ore.

## Regole del repository
- **Mai** committare segreti: `.env` è ignorato; usa le variabili d'ambiente della piattaforma di deploy.
- I segreti vanno generati: `openssl rand -base64 64` (JWT access e refresh **diversi**).
- Un token incollato in una chat, un ticket o uno screenshot è compromesso: va revocato e rigenerato subito.
- In produzione `NODE_ENV=production` fa rifiutare l'avvio con segreti di esempio o deboli.

## Cosa è già applicato (backend)
Argon2id; JWT HS256 con issuer/audience e controllo stato utente a ogni richiesta; refresh token a rotazione atomica con
rilevamento del riuso; rate limit globale e stretto su /auth; risposte di login senza differenze di errore/timing;
policy password; RBAC lato server con blocco dell'escalation di privilegi; IP client affidabile (trust proxy esplicito);
audit log append-only a livello database; cancellazione GDPR che anonimizza e chiude le sessioni.

## Frontend (Next.js)
Sessione: access token (15 min) solo in memoria JS; refresh token in cookie `__Host-` httpOnly + Secure + SameSite=Strict
gestito dal BFF (`/api/auth/*`): un XSS non può rubarlo. Refresh single-flight + Web Locks tra schede (il backend tratta il
riuso di un refresh token come furto). POST di autenticazione accettati solo dalla stessa origine (anti-CSRF).
CSP con nonce per richiesta (niente `unsafe-inline` sugli script), HSTS, frame-ancestors none, niente ottimizzatore immagini.
Next.js 15.5.x: la linea 14.x non riceve più correzioni di sicurezza. Da pianificare il passaggio a Next 16.
Requisito di deploy: davanti a Next deve esserci un proxy fidato che SOVRASCRIVE `X-Forwarded-For`, e `TRUST_PROXY` del backend
deve corrispondere al numero di hop; imposta `APP_ORIGIN`.

## Verifica email, recupero password, MFA
- Registrazione con risposta identica per email nuova ed esistente (anti-enumeration); l'account resta `pending_verification`
  e non può accedere finché l'email non è verificata. Link nel *fragment* (`#token=`): non finisce in log né Referer.
- Token email monouso, 256 bit, solo SHA-256 nel DB, scadenza (verifica 24 h, reset 1 h, invito staff 72 h); l'ultimo link invalida i precedenti.
- Reset password: chiude tutte le sessioni e **non salta l'MFA**. Una password debole non brucia il link.
- Invito staff: l'utente imposta la password dal link; al primo accesso deve configurare l'MFA (token a scopo limitato, nessun accesso prima).
- MFA TOTP (RFC 6238, verificata con i vettori ufficiali): segreto cifrato a riposo AES-256-GCM legato all'utente
  (`MFA_ENCRYPTION_KEY`), anti-replay (un codice vale una volta), lockout persistente dopo 5 errori (15 min, vale anche
  contro attacchi da molti IP), 10 codici di recupero monouso (solo hash). Obbligatoria per lo staff; solo il Super Admin
  può resettarla per un dispositivo perso.
- **Conserva `MFA_ENCRYPTION_KEY` nel gestore segreti: se la perdi, nessun utente con MFA potrà più accedere.**
- Le email partono da un dominio verificato su Resend (`MAIL_FROM`); in produzione `RESEND_API_KEY` è obbligatoria.

## Ancora da fare prima di un lancio pubblico
Passkey/WebAuthn come alternativa al TOTP; pagina admin per gestire l'MFA dello staff; il vecchio `index.html` è un
prototipo con auth locale (da dismettere); upload audio con scansione e URL firmati; WAF/CDN; backup testati; penetration test;
DPIA, Termini/Privacy validati da un legale, etichettatura dei contenuti generati da AI (AI Act art. 50), procedura DSA di segnalazione e rimozione.
