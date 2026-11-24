'use client';

// Banner riusabile per "servizio backend non disponibile".
// Mostra uno stato realistico senza simulare operazioni riuscite:
//   - NON mostra dati fittizi spacciati per reali
//   - NON mostra messaggi di successo
//   - Dice esplicitamente che il servizio non è disponibile
//   - Suggerisce azioni concrete all'utente (riprovare più tardi, contattare)
//
// Usato in tutte le pagine protette quando api() lancia BackendUnavailableError.
// Le pagine devono distinguere:
//   - errore di rete (BackendUnavailableError) → questo componente
//   - errore HTTP dal backend (altro Error) → messaggio raw di errore

export default function ServiceUnavailable({ context = 'questa pagina' }: { context?: string }) {
  return (
    <div className="card bg-yellow-500/10 border-yellow-500/40 text-yellow-200">
      <div className="flex items-start gap-3">
        <span className="text-2xl leading-none">⚠️</span>
        <div className="flex-1">
          <h3 className="font-semibold text-aura-text mb-1">Servizio backend non disponibile</h3>
          <p className="text-sm text-aura-mute leading-relaxed">
            Non è stato possibile contattare il backend Aura per {context}. Le schermate sono
            navigabili ma nessuna operazione (creazione, modifica, sospensione, cancellazione)
            può essere eseguita finché il servizio non torna online.
          </p>
          <p className="text-xs text-aura-dim mt-2">
            Possibili cause: deploy del backend in corso, backend non ancora pubblicato,
            errore di rete temporaneo. Riprova tra qualche minuto.
          </p>
        </div>
      </div>
    </div>
  );
}
