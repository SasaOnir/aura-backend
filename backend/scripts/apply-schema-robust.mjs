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

// Split robusto: tiene traccia del livello di parentesi () e dei blocchi $$
function splitStatements(sql) {
  const statements = [];
  let buf = '';
  let parenDepth = 0;
  let inDollar = false;
  let dollarTag = null;

  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    const next = sql[i + 1];

    // Rileva $tag$ ... $tag$ (dollar-quoted string)
    if (ch === '$' && !inDollar) {
      // Cerca il $ di chiusura del tag
      const rest = sql.substring(i);
      const m = rest.match(/^\$[A-Za-z_0-9]*\$/);
      if (m) {
        dollarTag = m[0];
        inDollar = true;
        buf += m[0];
        i += m[0].length - 1;
        continue;
      }
    } else if (inDollar && ch === '$') {
      const rest = sql.substring(i);
      if (rest.startsWith(dollarTag)) {
        buf += dollarTag;
        inDollar = false;
        dollarTag = null;
        i += dollarTag ? dollarTag.length - 1 : 0;
        continue;
      }
    }

    if (!inDollar) {
      if (ch === '(') parenDepth++;
      else if (ch === ')') parenDepth--;
      else if (ch === ';' && parenDepth === 0) {
        statements.push(buf.trim());
        buf = '';
        continue;
      }
      // ignora i commenti -- fino a fine riga
      if (ch === '-' && next === '-') {
        // salta fino a \n
        while (i < sql.length && sql[i] !== '\n') i++;
        continue;
      }
    }
    buf += ch;
  }
  if (buf.trim()) statements.push(buf.trim());
  return statements.filter(s => s);
}

function makeIdempotent(stmt) {
  return stmt
    .replace(/^CREATE\s+TABLE\s+(?!IF\s+NOT\s+EXISTS)/i, 'CREATE TABLE IF NOT EXISTS ')
    .replace(/^CREATE\s+INDEX\s+(?!IF\s+NOT\s+EXISTS)/i, 'CREATE INDEX IF NOT EXISTS ')
    .replace(/^CREATE\s+UNIQUE\s+INDEX\s+(?!IF\s+NOT\s+EXISTS)/i, 'CREATE UNIQUE INDEX IF NOT EXISTS ')
    .replace(/^CREATE\s+EXTENSION\s+(?!IF\s+NOT\s+EXISTS)/i, 'CREATE EXTENSION IF NOT EXISTS ')
    .replace(/^CREATE\s+TYPE\s+(?!IF\s+NOT\s+EXISTS)/i, 'CREATE TYPE IF NOT EXISTS ');
}

const statements = splitStatements(schema);
console.log(`statements totali (split robusto): ${statements.length}`);

const client = new pg.Client({ connectionString: connInfo });
await client.connect();
console.log('connesso via TCP');

const MAX_PASSES = 6;
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
      if (/does not exist/i.test(msg)) {
        fail++;
        stillPending.push(item);
      } else if (/already exists|duplicate|conflicts/i.test(msg)) {
        ok++;
      } else {
        fail++;
        if (allErrors.length < 15) allErrors.push({ i: item.i, err: msg.substring(0, 150), preview: item.sql.substring(0, 80) });
      }
    }
  }
  console.log(`pass ${pass}: ok=${ok} fail=${fail} (stillPending=${stillPending.length})`);
  pending = stillPending;
  if (pending.length === 0) break;
  if (ok === 0 && fail > 0 && pending.length === statements.length) {
    console.log('  nessun progresso, fermo');
    break;
  }
}

// Verifica
const t = await client.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename");
console.log(`\ntabelle create: ${t.rows.length}`);
for (const r of t.rows.slice(0, 60)) console.log(`  - ${r.tablename}`);

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
  for (const e of allErrors) console.log(`  #${e.i}: ${e.err}\n     stmt: ${e.preview}`);
}

await client.end();
