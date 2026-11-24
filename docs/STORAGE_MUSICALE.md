# Valutazione Storage Musicale per Aura

**Data:** 24 novembre 2026
**Stato:** Valutazione tecnica — nessun servizio attivato (come da richiesta
utente: nessun servizio a pagamento).

## Requisiti di Aura per l'audio

- File audio: tracce musicali di artisti (formati .mp3, .wav, .flac, .ogg).
- Dimensione media stimata: 5-10 MB per traccia compressa (MP3 320kbps),
  30-50 MB per traccia lossless (WAV/FLAC).
- Pattern di accesso: upload da parte dell'artista (scrittura rara),
  streaming/download da parte dei listener (lettura frequente, anche
  concorrente).
- Vincolo utente: **nessun servizio a pagamento** in Fase 1.
- Vincolo architetturale: i file audio **NON** vanno nel database PostgreSQL
  (Neon); vanno in object storage S3-compatible esterno.

Il codice esistente (`.env.example`, `docker-compose.yml`) già prevede le
variabili `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY`,
`S3_SECRET_KEY`, `S3_FORCE_PATH_STYLE` — segno che l'architettura è già
disegnata per S3-compatible. In dev si usa MinIO (container locale).

## Confronto free-tier (dati verificati 24 nov 2026)

| Servizio              | Storage free | Egress free                          | Max file size | S3 API | Bandiere                                   |
|-----------------------|--------------|--------------------------------------|---------------|--------|--------------------------------------------|
| **Cloudflare R2**     | 10 GB/mese   | **Illimitato** (zero egress fee)     | 5 TB          | ✅     | Egress gratuito = ideale per streaming    |
| **Backblaze B2**      | 10 GB        | Fino a 3× lo storage medio mensile   | 5 TB          | ✅     | Egress limitato a 3× storage               |
| **Supabase Storage** | 1 GB         | 2 GB transfer                        | 50 MB         | ❌ (SDK)| Limite 50 MB per file = bloccante per lossless |

### Fonti citate (verificate 24 nov 2026)

- Cloudflare R2 — https://developers.cloudflare.com/r2/pricing
  > "Free tier: 10 GB-month storage, 1M Class A ops, 10M Class B ops, egress free"
- Backblaze B2 — https://www.backblaze.com/cloud-storage/pricing
  > "First 10GB storage always free. Free egress up to 3x storage."
- Supabase Storage — https://supabase.com/docs/guides/storage/uploads/file-limits
  > "For Free projects, the limit can't exceed 50 MB."

## Raccomandazione: Cloudflare R2

**R2 è la scelta tecnicamente migliore per Aura in Fase 1**, per tre motivi:

1. **Egress gratuito e illimitato.** Per una piattaforma musicale, l'egress
   (download/streaming verso i listener) è il costo che scala con gli utenti.
   R2 è esplicitamente progettato per questo scenario ("egress-free object
   storage"). B2 limita l'egress a 3× lo storage medio: se si hanno 10 GB
   storage, l'egress mensile gratuito è 30 GB — scarso per una piattaforma
   musicale in crescita.

2. **10 GB storage gratuiti** — sufficienti per circa 200-500 tracce MP3 in
   Fase 1 (onboarding dei primi artisti). B2 offre gli stessi 10 GB, ma con
   il limite di egress citato sopra.

3. **API S3-compatible** — il backend esistente (variabili `S3_*` in
   `.env.example`) funziona con R2 senza modifiche al codice: si cambiano
   solo i valori delle env var. SDK client: `@aws-sdk/client-s3` o
   `ioredis`-equivalenti, già standard nell'ecosistema Node.

**Supabase Storage è escluso** per il limite di 50 MB per file sul free
tier, che bloccherebbe il caricamento di tracce lossless (WAV/FLAC).

## Configurazione minima per Aura (futura, quando autorizzata)

Nessun servizio va attivato ora. Quando l'utente autorizzerà:

1. Creare un bucket R2 `aura-audio` dal dashboard Cloudflare.
2. Generare una coppia di chiavi API R2 (Access Key ID + Secret Access Key).
3. Popolare le env var del backend:
   ```
   S3_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
   S3_REGION=auto
   S3_BUCKET=aura-audio
   S3_ACCESS_KEY=<r2-access-key-id>
   S3_SECRET_KEY=<r2-secret-access-key>
   S3_FORCE_PATH_STYLE=false
   ```
4. Implementare nel backend un `StorageService` NestJS che usi
   `@aws-sdk/client-s3` per `putObject` (upload traccia) e `getObject` o
   URL pre-firmati (streaming). Il pattern URL pre-firmato è preferibile:
   il backend firma l'URL e il frontend scarica direttamente da R2, senza
   passare dal backend (risparmio di banda e latenza).

## Note di sicurezza

- I file audio caricati devono essere validati (magic number, non solo
  estensione) per evitare upload di file malevoli.
- I bucket R2 vanno configurati con policy privata: niente accesso pubblico
  anonimo. L'accesso avviene solo via URL pre-firmati con TTL breve
  (es. 15 minuti).
- I metadati della traccia (titolo, durata, formato, bitrate, autore)
  **restano in PostgreSQL** (Neon) come metadati; solo il blob audio va in
  R2. Lo schema `backend/db/schema.sql` andrà esteso con una tabella
  `audio_tracks` che referenzia l'`S3_key` (stringa), non il file binario.
