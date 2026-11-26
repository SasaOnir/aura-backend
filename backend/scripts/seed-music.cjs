// Seed dati demo per Aura Music — popola catalogo con artisti, brani, generi.
// Esegue via node -I ... (no auto-import). Usa pg nativo.
// Sorgente dati: schema già presente nel DB Neon (artists/releases/tracks/genres).
// Idempotente: controlla se esiste già un artista "Luna Vetro" prima di inserire.

const { Client } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) { console.error('DATABASE_URL mancante'); process.exit(1); }

const SUPER_ADMIN_ID = '4ee08160-c283-425f-b981-1805b8815428'; // sasacaruso84@gmail.com

async function main() {
  const pg = new Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await pg.connect();
  console.log('→ Connesso al DB Neon\n');

  // 1. Generi (idempotente)
  console.log('1. Inserisco generi...');
  const genres = ['Electronic', 'Ambient', 'House', 'Techno', 'Lo-fi', 'Cinematic', 'Synthwave', 'Experimental'];
  for (const name of genres) {
    await pg.query('INSERT INTO genres (name) VALUES ($1) ON CONFLICT (name) DO NOTHING', [name]);
  }
  const genreRows = await pg.query('SELECT id, name FROM genres');
  const genreByName = Object.fromEntries(genreRows.rows.map(r => [r.name, r.id]));
  console.log('   ✓ ' + Object.keys(genreByName).length + ' generi presenti\n');

  // 2. Artisti demo (3 artisti + 1 di proprietà del super_admin)
  console.log('2. Inserisco artisti demo...');
  const artists = [
    { name: 'Luna Vetro',       slug: 'luna-vetro',       bio: 'Live set di synthwave notturna. Milano, IT.', img: 'https://picsum.photos/seed/lunavetro/400' },
    { name: 'Karma Frequencies', slug: 'karma-frequencies', bio: 'Ambient/cinematic per meditazione profonda.', img: 'https://picsum.photos/seed/karma/400' },
    { name: 'Dust & Static',    slug: 'dust-and-static',  bio: 'Lo-fi house da cantieri abbandonati.', img: 'https://picsum.photos/seed/dust/400' },
    { name: 'Sasa Caruso (Demo)', slug: 'sasa-caruso-demo', bio: 'Profilo artista del super admin (test).', img: 'https://picsum.photos/seed/sasa/400', owner: SUPER_ADMIN_ID },
  ];
  const artistIds = {};
  for (const a of artists) {
    const existing = await pg.query('SELECT id FROM artists WHERE slug = $1', [a.slug]);
    let id;
    if (existing.rows.length) {
      id = existing.rows[0].id;
    } else {
      const r = await pg.query(
        'INSERT INTO artists (artist_name, slug, biography, image_url, owner_user_id, verification_status) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',
        [a.name, a.slug, a.bio, a.img, a.owner || null, a.owner ? 'verified' : 'verified'],
      );
      id = r.rows[0].id;
    }
    artistIds[a.slug] = id;
  }
  console.log('   ✓ ' + Object.keys(artistIds).length + ' artisti\n');

  // 3. Release + tracks (10 brani totali, pubblicati)
  console.log('3. Inserisco release + brani...');
  const releasesData = [
    { artistSlug: 'luna-vetro',       title: 'Neonide',           type: 'album',  tracks: [
      { t: 'Aurora 2089',     d: 248, genres: ['Synthwave','Electronic'], pos: 1 },
      { t: 'Specchi Polari',  d: 312, genres: ['Synthwave','Ambient'],    pos: 2 },
      { t: 'Krypton',         d: 198, genres: ['Synthwave'],              pos: 3 },
    ]},
    { artistSlug: 'karma-frequencies', title: 'Meditazioni 01',   type: 'ep',     tracks: [
      { t: 'Respiro del Bosco', d: 422, genres: ['Ambient'],      pos: 1 },
      { t: 'Aurora Borealis',   d: 388, genres: ['Ambient','Cinematic'], pos: 2 },
    ]},
    { artistSlug: 'dust-and-static',   title: 'Underground Tape', type: 'ep',     tracks: [
      { t: 'Cantiere 7AM',  d: 342, genres: ['House','Lo-fi'],     pos: 1 },
      { t: 'Static Bloom',  d: 287, genres: ['House'],           pos: 2 },
      { t: 'Morning Static', d: 254, genres: ['Lo-fi'],          pos: 3 },
    ]},
    { artistSlug: 'sasa-caruso-demo',  title: 'Prima Mossa',      type: 'single', tracks: [
      { t: 'Brano Demo 01', d: 196, genres: ['Experimental','Electronic'], pos: 1 },
      { t: 'Brano Demo 02', d: 224, genres: ['Electronic'],      pos: 2 },
    ]},
  ];

  let totalTracks = 0;
  for (const rel of releasesData) {
    const artistId = artistIds[rel.artistSlug];
    // release
    let releaseId;
    const existingRel = await pg.query('SELECT id FROM releases WHERE artist_id=$1 AND title=$2', [artistId, rel.title]);
    if (existingRel.rows.length) {
      releaseId = existingRel.rows[0].id;
    } else {
      const r = await pg.query(
        'INSERT INTO releases (artist_id, title, release_type, status, release_date) VALUES ($1,$2,$3,$4, NOW()::date) RETURNING id',
        [artistId, rel.title, rel.type, 'published'],
      );
      releaseId = r.rows[0].id;
    }
    // tracks
    for (const t of rel.tracks) {
      const existingTrack = await pg.query('SELECT id FROM tracks WHERE release_id=$1 AND title=$2', [releaseId, t.t]);
      let trackId;
      if (existingTrack.rows.length) {
        trackId = existingTrack.rows[0].id;
      } else {
        const r = await pg.query(
          'INSERT INTO tracks (release_id, title, duration, position, status) VALUES ($1,$2,$3,$4,$5) RETURNING id',
          [releaseId, t.t, t.d, t.pos, 'published'],
        );
        trackId = r.rows[0].id;
      }
      // genera track_asset preview (storage_key fittizio)
      const assetEx = await pg.query('SELECT id FROM track_assets WHERE track_id=$1 AND asset_type=$2', [trackId, 'preview']);
      if (!assetEx.rows.length) {
        await pg.query(
          "INSERT INTO track_assets (track_id, asset_type, storage_key, format, processing_status) VALUES ($1,'preview',$2,'mp3','ready')",
          [trackId, 'demo/' + trackId + '.mp3'],
        );
      }
      // genera link track_genres
      for (const gname of t.genres) {
        const gid = genreByName[gname];
        if (gid) await pg.query('INSERT INTO track_genres (track_id, genre_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [trackId, gid]);
      }
      totalTracks++;
    }
  }
  console.log('   ✓ ' + releasesData.length + ' release, ' + totalTracks + ' brani pubblicati\n');

  // 4. 2 playlist di sistema per il super_admin
  console.log('4. Inserisco 2 playlist demo per il super admin...');
  const allTracks = await pg.query("SELECT t.id FROM tracks t JOIN releases r ON t.release_id=r.id WHERE r.artist_id != $1 AND t.status='published' LIMIT 6", [artistIds['sasa-caruso-demo']]);
  const playlistsData = [
    { title: 'Notturna',     visibility: 'public', trackIds: allTracks.rows.slice(0,4).map(r => r.id) },
    { title: 'Lavoro Focale', visibility: 'private', trackIds: allTracks.rows.slice(4,6).map(r => r.id) },
  ];
  for (const p of playlistsData) {
    const existing = await pg.query('SELECT id FROM playlists WHERE owner_user_id=$1 AND title=$2', [SUPER_ADMIN_ID, p.title]);
    let pid;
    if (existing.rows.length) {
      pid = existing.rows[0].id;
    } else {
      const r = await pg.query(
        'INSERT INTO playlists (owner_user_id, title, visibility) VALUES ($1,$2,$3) RETURNING id',
        [SUPER_ADMIN_ID, p.title, p.visibility],
      );
      pid = r.rows[0].id;
    }
    for (let i = 0; i < p.trackIds.length; i++) {
      await pg.query(
        'INSERT INTO playlist_tracks (playlist_id, track_id, position) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
        [pid, p.trackIds[i], i+1],
      );
    }
  }
  console.log('   ✓ 2 playlist create\n');

  // 5. Follow: super_admin segue 2 artisti
  console.log('5. Inserisco follows demo...');
  await pg.query('INSERT INTO follows (follower_user_id, artist_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [SUPER_ADMIN_ID, artistIds['luna-vetro']]);
  await pg.query('INSERT INTO follows (follower_user_id, artist_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [SUPER_ADMIN_ID, artistIds['karma-frequencies']]);
  console.log('   ✓ 2 follows\n');

  // 6. Eventi di ascolto demo (per popolare history + stats)
  console.log('6. Inserisco ascolti demo...');
  const sampleTracks = (await pg.query("SELECT id FROM tracks WHERE status='published' LIMIT 10")).rows;
  let plays = 0;
  for (const t of sampleTracks) {
    const n = 1 + Math.floor(Math.random() * 8);
    for (let i = 0; i < n; i++) {
      const ago = Math.floor(Math.random() * 7 * 86400_000);
      await pg.query(
        "INSERT INTO listening_events (user_id, track_id, started_at, ended_at, qualified_duration, source, event_type) VALUES ($1,$2,NOW() - ($3 || ' milliseconds')::interval, NOW() - ($3 || ' milliseconds')::interval + INTERVAL '3 minutes', 180, 'web', 'complete')",
        [SUPER_ADMIN_ID, t.id, String(ago)],
      );
      plays++;
    }
  }
  console.log('   ✓ ' + plays + ' eventi di ascolto registrati\n');

  // Riepilogo finale
  const c = await pg.query(`
    SELECT
      (SELECT COUNT(*) FROM artists) AS artists,
      (SELECT COUNT(*) FROM releases WHERE status='published') AS releases_pub,
      (SELECT COUNT(*) FROM tracks WHERE status='published') AS tracks_pub,
      (SELECT COUNT(*) FROM genres) AS genres,
      (SELECT COUNT(*) FROM playlists) AS playlists,
      (SELECT COUNT(*) FROM follows) AS follows,
      (SELECT COUNT(*) FROM listening_events) AS listens
  `);
  const r = c.rows[0];
  console.log('═══ RIASSUNTO DB ═══');
  console.log('  Artisti       : ' + r.artists);
  console.log('  Release pub.  : ' + r.releases_pub);
  console.log('  Brani pub.    : ' + r.tracks_pub);
  console.log('  Generi        : ' + r.genres);
  console.log('  Playlist      : ' + r.playlists);
  console.log('  Follows       : ' + r.follows);
  console.log('  Ascolti       : ' + r.listens);

  await pg.end();
  console.log('\n→ Seed completato.');
}

main().catch(e => {
  console.error('\n✗ ERRORE:', e.message);
  console.error(e.stack);
  process.exit(1);
});
