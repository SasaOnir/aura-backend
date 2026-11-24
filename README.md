# Aura — Piattaforma per artisti di musica AI

Applicazione web single-file (HTML/CSS/JS, nessuna dipendenza, nessun build) per artisti di musica generata con AI. Tutti i dati restano nel browser (localStorage + IndexedDB) — privacy-first.

## ✨ Funzionalità

### Autenticazione & privacy
- Registrazione/login con password hashate **SHA-256 + salt** (SubtleCrypto)
- **Recupero password** (`#recover`) — reimposta la password localmente
- Cambia password da Impostazioni (utente loggato)
- Banner cookie, consensi GDPR espliciti (art.6/7/9/20/21)
- Audit log (art.15), esporta dati JSON (art.20), cancellazione account (art.17)

### Contenuti musicali
- Player audio reale (Web Audio API + IndexedDB per gli MP3 caricati)
- Upload brani con **catena creativa AI obbligatoria** (EU AI Act art.50): modello, prompt, licenza, dichiarazioni di responsabilità
- Badge "AI" sui brani generati con AI
- Playlist, like, condivisione, segnalazioni DSA

### Votazione Aura (like pubblici)
- **Guest non registrati** possono dare "Aura" ai brani
- Una Aura per brano per votante (fingerprint persistente, anti-abuso)
- Pagina pubblica `#vote` con tutti i brani votabili

### Profilo artista professionale
- Copertina gradient + avatar con badge "✓ Artista verificato"
- 4 statistiche: follower totali, brani, Aura, top Aura brano
- **Canali social** (Instagram, TikTok, YouTube, Spotify, SoundCloud) con follower count e link cliccabili
- Vista pubblica `#artist-public/<id>` accessibile ai guest

### ⚔️ Match / Aura Battle
- Sfide 1v1 tra artisti basate sui like (Aura) accumulati
- Aperte a tutti (guest inclusi) — una Aura per lato per match
- Timer countdown 24h, risoluzione automatica con vincitore
- Barra di progresso con percentuali in tempo reale
- **Classifica Aura 🏆** con podio (🥇🥈🥉)

## 🚀 Come usarlo
1. Apri `index.html` in qualsiasi browser moderno (desktop o mobile)
2. Oppure visita la versione online: <https://sasaonir.github.io/aura-platform>
3. Niente server, niente installazione, funziona offline

## 🎨 Design
Palette "aurora": indigo notte + corallo, viola, turchese, giallo sole. Luminosa e positiva. Responsive (mobile-first).

## 🔒 Sicurezza & conformità
- **GDPR**: dati minimi, consensi espliciti, tutti i diritti (accesso, rettifica, cancellazione, portabilità, opposizione, revoca)
- **DSA**: segnalazioni contenuti, pagina di report
- **EU AI Act art.50**: trasparenza catena creativa AI obbligatoria per ogni brano
- Password **irreversibili** (SHA-256 + salt) — per questo si *reimposta* la password, non si recupera
- Nessun dato lascia il dispositivo dell'utente

## 📁 Struttura
```
index.html   ← l'intera applicazione (single-file)
README.md
```

## Tech
HTML5 + CSS3 (variabili, grid, flexbox) + JavaScript vanilla. Web Audio API, IndexedDB, SubtleCrypto. Nessun framework, nessuna dipendenza esterna.
