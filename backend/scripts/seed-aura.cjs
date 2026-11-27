// Seed AURA system: battles, votes, streaming connections, public profiles, collaborations.
// Idempotente: controlla se esistono già battles prima di inserire.
const { Client } = require('pg');

async function main() {
  const pg = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await pg.connect();
  console.log('→ Seed AURA system\n');

  const SUPER_ADMIN_ID = '4ee08160-c283-425f-b981-1805b8815428';

  // 1. Aggiorna profili pubblici artisti (public_slug, social, verified_badge, monthly_listeners)
  console.log('1. Aggiorno profili pubblici artisti...');
  const artists = await pg.query('SELECT id, artist_name, slug FROM artists ORDER BY artist_name');
  for (const a of artists.rows) {
    const publicSlug = a.slug;
    const social = JSON.stringify({
      instagram: '@' + a.slug.replace(/-/g, '_'),
      tiktok: '@' + a.slug.replace(/-/g, '_'),
      youtube: 'https://youtube.com/@' + a.slug,
    });
    await pg.query(
      `UPDATE artists SET
        public_slug = $1,
        social_links = $2::jsonb,
        website_url = $3,
        verified_badge = $4,
        monthly_listeners = $5,
        total_plays = $6
       WHERE id = $7`,
      [
        publicSlug,
        social,
        'https://' + a.slug + '.aura.fm',
        a.slug === 'sasa-caruso-demo' ? true : (Math.random() > 0.5),
        Math.floor(Math.random() * 5000) + 100,
        Math.floor(Math.random() * 8000) + 50,
        a.id,
      ]
    );
  }
  console.log('   ✓ ' + artists.rows.length + ' profili pubblici aggiornati\n');

  // 2. Crea 3 battles
  console.log('2. Creo battles demo...');
  const allTracks = await pg.query("SELECT t.id, t.title, r.artist_id FROM tracks t JOIN releases r ON t.release_id = r.id WHERE t.status='published'");
  const battles = [
    {
      title: 'Synthwave Showdown',
      description: 'Sfida settimanale dei migliori brani synthwave. Il vincitore entra nella playlist ufficiale AURA.',
      duration: '7d', start_offset: -5 * 86400_000, end_offset: 2 * 86400_000,
    },
    {
      title: 'Notturna 24h Battle',
      description: 'Sfida lampo 24 ore. Brani ambient/cinematic si sfidano per il podio notturno.',
      duration: '24h', start_offset: -12 * 3600_000, end_offset: 12 * 3600_000,
    },
    {
      title: 'House Clash 3-Giorni',
      description: '3 giorni di battaglia house/lo-fi. I top 3 vanno in rotazione.',
      duration: '3d', start_offset: -1 * 86400_000, end_offset: 2 * 86400_000,
    },
  ];
  const battleIds = [];
  for (const b of battles) {
    const existing = await pg.query('SELECT id FROM battles WHERE title = $1', [b.title]);
    let id;
    if (existing.rows.length) {
      id = existing.rows[0].id;
    } else {
      const start = new Date(Date.now() + b.start_offset);
      const end = new Date(Date.now() + b.end_offset);
      const r = await pg.query(
        `INSERT INTO battles (title, description, battle_type, duration, status, start_at, end_at, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
        [b.title, b.description, 'tracks', b.duration, 'active', start, end, SUPER_ADMIN_ID]
      );
      id = r.rows[0].id;
    }
    battleIds.push(id);
  }
  console.log('   ✓ 3 battles create\n');

  // 3. Iscrivi brani alle battles (4-6 per battle)
  console.log('3. Iscrivo brani alle battles...');
  // Battle 0 (Synthwave): brani con genere Synthwave
  const synthTracks = allTracks.rows.filter(async t => {
    const g = await pg.query("SELECT g.name FROM track_genres tg JOIN genres g ON tg.genre_id=g.id WHERE tg.track_id=$1", [t.id]);
    return g.rows.some(r => r.name === 'Synthwave');
  });
  // Più semplice: prendi brani a caso per ogni battle
  const battleTrackSets = [
    allTracks.rows.slice(0, 4),  // Battle 0: primi 4
    allTracks.rows.slice(2, 6),  // Battle 1: brani 3-6
    allTracks.rows.slice(4, 8),  // Battle 2: brani 5-8
  ];
  for (let bi = 0; bi < battleIds.length; bi++) {
    for (const t of battleTrackSets[bi]) {
      await pg.query(
        'INSERT INTO battle_participants (battle_id, track_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
        [battleIds[bi], t.id]
      );
    }
  }
  console.log('   ✓ Brani iscritti (~12 partecipazioni totali)\n');

  // 4. Genera ~80 vote AURA distribuiti
  console.log('4. Genero voti AURA...');
  const userRows = await pg.query('SELECT id FROM users LIMIT 5');
  const userIds = userRows.rows.map(r => r.id);
  let voteCount = 0;
  // Voti sulle battles (40 voti)
  for (let bi = 0; bi < battleIds.length; bi++) {
    const participants = await pg.query('SELECT track_id FROM battle_participants WHERE battle_id=$1', [battleIds[bi]]);
    for (let i = 0; i < 14; i++) {
      const trackId = participants.rows[Math.floor(Math.random() * participants.rows.length)].track_id;
      const userId = userIds[Math.floor(Math.random() * userIds.length)];
      const value = Math.random() > 0.15 ? 1 : -1;  // 85% positivi
      try {
        await pg.query(
          `INSERT INTO aura_votes (track_id, user_id, battle_id, voter_fingerprint, aura_value, created_at)
           VALUES ($1,$2,$3,$4,$5, NOW() - ($6 || ' hours')::interval)
           ON CONFLICT DO NOTHING`,
          [trackId, userId, battleIds[bi], null, value, String(Math.floor(Math.random() * 48))]
        );
        voteCount++;
      } catch (e) { /* skip duplicate */ }
    }
  }
  // Voti su brani non in battle (40 voti)
  for (let i = 0; i < 40; i++) {
    const trackId = allTracks.rows[Math.floor(Math.random() * allTracks.rows.length)].id;
    const userId = userIds[Math.floor(Math.random() * userIds.length)];
    const value = Math.random() > 0.1 ? 1 : -1;
    try {
      await pg.query(
        `INSERT INTO aura_votes (track_id, user_id, battle_id, voter_fingerprint, aura_value, created_at)
         VALUES ($1,$2,NULL,$3,$4, NOW() - ($5 || ' hours')::interval)
         ON CONFLICT DO NOTHING`,
        [trackId, userId, null, value, String(Math.floor(Math.random() * 168))]
      );
      voteCount++;
    } catch (e) { /* skip */ }
  }
  console.log('   ✓ ~' + voteCount + ' voti AURA inseriti\n');

  // 5. Streaming connection YouTube mock
  console.log('5. Creo streaming connection YouTube...');
  const playlist = await pg.query("SELECT id FROM playlists WHERE title='Notturna' LIMIT 1");
  if (playlist.rows.length) {
    const existingConn = await pg.query("SELECT id FROM streaming_connections WHERE platform='youtube'");
    if (!existingConn.rows.length) {
      await pg.query(
        `INSERT INTO streaming_connections (name, platform, status, config, connected_playlist_id, last_sync_at)
         VALUES ($1, $2, $3, $4::jsonb, $5, NOW())`,
        [
          'AURA Official YouTube Channel',
          'youtube',
          'active',
          JSON.stringify({
            channel_id: 'UC_AuraOfficialDemo',
            channel_name: 'AURA — Official',
            stream_key_ref: 'secret://youtube/stream_key',
            auto_publish: true,
            description: 'Live streaming 24/7 della playlist top AURA',
          }),
          playlist.rows[0].id,
        ]
      );
    }
  }
  console.log('   ✓ 1 YouTube connection (collegata a playlist "Notturna")\n');

  // 6. Collaborations demo
  console.log('6. Creo collaborations demo...');
  const artistRows = await pg.query('SELECT id, artist_name FROM artists ORDER BY artist_name');
  const collabs = [
    { a: 0, b: 1, status: 'accepted', msg: 'Ho sentito il tuo ultimo brano synthwave, vogliamo fare un duetto ambient/synth?' },
    { a: 2, b: 3, status: 'pending', msg: 'Ciao! Vorrei un featuring house/synthwave per il prossimo EP.' },
    { a: 0, b: 2, status: 'pending', msg: 'Match perfetto: synthwave + house. Pensiamoci.' },
  ];
  for (const c of collabs) {
    if (c.a < artistRows.rows.length && c.b < artistRows.rows.length) {
      const aId = artistRows.rows[c.a].id;
      const bId = artistRows.rows[c.b].id;
      const existing = await pg.query('SELECT id FROM collaborations WHERE artist_a_id=$1 AND artist_b_id=$2', [aId, bId]);
      if (!existing.rows.length) {
        await pg.query(
          `INSERT INTO collaborations (artist_a_id, artist_b_id, status, proposed_by, message)
           VALUES ($1,$2,$3,$4,$5)`,
          [aId, bId, c.status, SUPER_ADMIN_ID, c.msg]
        );
      }
    }
  }
  console.log('   ✓ 3 collaborations create\n');

  // Riepilogo
  const c = await pg.query(`
    SELECT
      (SELECT COUNT(*) FROM artists WHERE public_slug IS NOT NULL) AS public_profiles,
      (SELECT COUNT(*) FROM battles) AS battles,
      (SELECT COUNT(*) FROM battle_participants) AS participants,
      (SELECT COUNT(*) FROM aura_votes) AS votes,
      (SELECT COUNT(*) FROM streaming_connections) AS streaming,
      (SELECT COUNT(*) FROM collaborations) AS collabs
  `);
  const r = c.rows[0];
  console.log('═══ RIASSUNTO AURA ═══');
  console.log('  Profili pubblici  : ' + r.public_profiles);
  console.log('  Battles           : ' + r.battles);
  console.log('  Partecipanti      : ' + r.participants);
  console.log('  Voti AURA         : ' + r.votes);
  console.log('  Streaming conns   : ' + r.streaming);
  console.log('  Collaborations    : ' + r.collabs);
  await pg.end();
  console.log('\n→ Seed AURA completato.');
}

main().catch(e => { console.error('\n✗ ERRORE:', e.message); console.error(e.stack); process.exit(1); });
