import pg from 'pg';
import { readFileSync } from 'fs';

// Leggi .env.local manualmente
const envLocal = readFileSync('/home/z/my-project/scripts/aura-repo/.env.local', 'utf8');
for (const line of envLocal.split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL_UNPOOLED });

// Disabilita il warning sslmode
process.env.PGAPPNAME = 'aura-schema-apply';

const schema = readFileSync('/home/z/my-project/scripts/aura-repo/backend/db/schema.sql', 'utf8');

// Esegui tutto lo schema in una singola query multi-statement
// pg supporta multi-statement in una sola query() se non ci sono parametri
await client.connect();
console.log('connesso via TCP a', process.env.DATABASE_URL_UNPOOLED.split('@')[1]?.substring(0, 40));

try {
  await client.query(schema);
  console.log('✓ schema applicato (multi-statement)');
} catch (e) {
  console.log('✗ multi-statement fallito, riprovo statement-per-statement');
  console.log('  err:', e.message.substring(0, 200));
  // Fallback: split per statement
  const statements = [];
  let buf = '';
  let inDollar = false;
  for (const line of schema.split('\n')) {
    const dollarCount = (line.match(/\$\$/g) || []).length;
    buf += line + '\n';
    if (dollarCount % 2 === 1) inDollar = !inDollar;
    if (!inDollar && line.trim().endsWith(';')) {
      statements.push(buf.trim());
      buf = '';
    }
  }
  if (buf.trim()) statements.push(buf.trim());
  console.log(`  statements: ${statements.length}`);
  let ok = 0, fail = 0;
  for (const stmt of statements) {
    if (!stmt || stmt.startsWith('--')) continue;
    try {
      await client.query(stmt);
      ok++;
    } catch (e) {
      fail++;
      if (fail < 10) console.log(`    ERR: ${e.message.substring(0, 150)}`);
    }
  }
  console.log(`  ok=${ok} fail=${fail}`);
}

// Verifica tabelle create
const t = await client.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename");
console.log(`\ntabelle create in public: ${t.rows.length}`);
for (const r of t.rows.slice(0, 40)) console.log(`  - ${r.tablename}`);

// Verifica ruoli di sistema
try {
  const roles = await client.query("SELECT name FROM roles WHERE is_system = true ORDER BY name");
  console.log(`\nruoli di sistema: ${roles.rows.length}`);
  for (const r of roles.rows) console.log(`  - ${r.name}`);
} catch (e) { console.log('ruoli:', e.message.substring(0, 80)); }

// Verifica utenti
const u = await client.query('SELECT count(*)::int as n FROM users');
console.log(`\nutenti totali: ${u.rows[0].n}`);

await client.end();
