import { neon } from '@neondatabase/serverless';
import { readFileSync } from 'fs';

// Leggi .env.local manualmente (dotenv non lo trova dal backend)
const envLocal = readFileSync('/home/z/my-project/scripts/aura-repo/.env.local', 'utf8');
for (const line of envLocal.split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
}

const sql = neon(process.env.DATABASE_URL_UNPOOLED);

// Verifica tabelle create
const tables = await sql`SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename`;
console.log(`tabelle create in public: ${tables.length}`);
for (const t of tables) console.log(`  - ${t.tablename}`);

// Verifica dati essenziali (roles di sistema)
try {
  const roles = await sql`SELECT name FROM roles WHERE is_system = true ORDER BY name`;
  console.log(`\nruoli di sistema: ${roles.length}`);
  for (const r of roles) console.log(`  - ${r.name}`);
} catch (e) { console.log('ruoli: skip', e.message); }

// Verifica utenti (vuoto ora)
const users = await sql`SELECT count(*)::int as n FROM users`;
console.log(`\nutenti: ${users[0].n}`);
