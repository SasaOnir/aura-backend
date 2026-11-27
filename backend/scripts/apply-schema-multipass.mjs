import pg from 'pg';
import { readFileSync } from 'fs';

// Leggi .env.local manualmente
const envLocal = readFileSync('/home/z/my-project/scripts/aura-repo/.env.local', 'utf8');
for (const line of envLocal.split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
}

const connInfo = process.env.DATABASE_URL_UNPOOLED;
const schema = readFileSync('/home/z/my-project/scripts/aura-repo/backend/db/schema.sql', 'utf8');

// Split statements (gestione $$ blocks)
function splitStatements(sql) {
  const statements = [];
  let buf = '';
  let inDollar = false;
  for (const line of sql.split('\n')) {
    const dollarCount = (line.match(/\$\$/g) || []).length;
    buf += line + '\n';
    if (dollarCount % 2 === 1) inDollar = !inDollar;
    if (!inDollar && line.trim().endsWith(';')) {
      statements.push(buf.trim());
      buf = '';
    }
  }
  if (buf.trim()) statements.push(buf.trim());
  return statements;
}

// Trasforma "CREATE TABLE x (...)" in "CREATE TABLE IF NOT EXISTS x (...)"
function makeIdempotent(stmt) {
  return stmt
    .replace(/^CREATE\s+TABLE\s+(?!IF\s+NOT\s+EXISTS)/i, 'CREATE TABLE IF NOT EXISTS ')
    .replace(/^CREATE\s+INDEX\s+(?!IF\s+NOT\s+EXISTS)/i, 'CREATE INDEX IF NOT EXISTS ')
    .replace(/^CREATE\s+UNIQUE\s+INDEX\s+(?!IF\s+NOT\s+EXISTS)/i, 'CREATE UNIQUE INDEX IF NOT EXISTS ')
    .replace(/^CREATE\s+EXTENSION\s+(?!IF\s+NOT\s+EXISTS)/i, 'CREATE EXTENSION IF NOT EXISTS ')
    .replace(/^CREATE\s+TYPE\s+(?!IF\s+NOT\s+EXISTS)/i, 'CREATE TYPE IF NOT EXISTS ');
}

const statements = splitStatements(schema).map(s => s.trim()).filter(s => s && !s.startsWith('--'));
console.log(`statements totali: ${statements.length}`);

const client = new pg.Client({ connectionString: connInfo });
await client.connect();
console.log('connesso via TCP');

// Multi-pass: ogni passata esegue gli statement idempotenti, ignorando errori FK forward
// Dopo alcune passate, tutte le tabelle esistono e le FK inline trovano i target.
const MAX_PASSES = 5;
let pending = statements.map((s, i) => ({ i, sql: makeIdempotent(s) }));
const allErrors = [];

for (let pass = 1; pass <= MAX_PASSES; pass++) {
  const stillPending = [];
  let ok = 0, fail = 0;
  for (const item of pending) {
    try {
      await client.query(item.sql);
      ok++;
    } catch (e) {
      const msg = e.message || '';
      // Errori "does not exist" = FK forward reference → riprova al pass successivo
      if (/does not exist/i.test(msg)) {
        fail++;
        stillPending.push(item);
      } else if (/already exists|duplicate|conflicts/i.test(msg)) {
        // già creato (idempotente) → ok
        ok++;
      } else {
        fail++;
        if (allErrors.length < 15) allErrors.push({ i: item.i, err: msg.substring(0, 150) });
      }
    }
  }
  console.log(`pass ${pass}: ok=${ok} fail=${fail} (stillPending=${stillPending.length})`);
  pending = stillPending;
  if (pending.length === 0) break;
  if (pending.length === statements.length) {
    console.log('  nessun progresso, fermo');
    break;
  }
}

// Verifica
const t = await client.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename");
console.log(`\ntabelle create: ${t.rows.length}`);
for (const r of t.rows.slice(0, 50)) console.log(`  - ${r.tablename}`);

try {
  const roles = await client.query("SELECT name FROM roles WHERE is_system = true ORDER BY name");
  console.log(`\nruoli di sistema: ${roles.rows.length}`);
  for (const r of roles.rows) console.log(`  - ${r.name}`);
} catch (e) { console.log('ruoli err:', e.message.substring(0, 80)); }

try {
  const u = await client.query('SELECT count(*)::int as n FROM users');
  console.log(`utenti totali: ${u.rows[0].n}`);
} catch (e) { console.log('users err:', e.message.substring(0, 80)); }

if (allErrors.length) {
  console.log('\n--- altri errori (non FK forward) ---');
  for (const e of allErrors) console.log(`  #${e.i}: ${e.err}`);
}

await client.end();
