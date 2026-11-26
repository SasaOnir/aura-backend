import pg from 'pg';
import { readFileSync } from 'fs';

const envLocal = readFileSync('/home/z/my-project/scripts/aura-repo/.env.local', 'utf8');
for (const line of envLocal.split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
}

const connInfo = process.env.DATABASE_URL_UNPOOLED;
const schema = readFileSync('/home/z/my-project/scripts/aura-repo/backend/db/schema.sql', 'utf8');

// Split robusto con gestione corretta di $tag$ ... $tag$
function splitStatements(sql) {
  const statements = [];
  let buf = '';
  let parenDepth = 0;
  let inString = false;
  let stringChar = null;
  let dollarTag = null;
  let i = 0;

  while (i < sql.length) {
    const ch = sql[i];
    const next = sql[i + 1];

    // Skip commenti -- fino a fine riga
    if (!inString && !dollarTag && ch === '-' && next === '-') {
      while (i < sql.length && sql[i] !== '\n') { i++; }
      continue;
    }
    // Skip commenti /* */
    if (!inString && !dollarTag && ch === '/' && next === '*') {
      i += 2;
      while (i < sql.length && !(sql[i] === '*' && sql[i+1] === '/')) i++;
      i += 2;
      continue;
    }

    // Dollar-quoted string: $tag$ ... $tag$
    if (!inString && ch === '$') {
      const rest = sql.substring(i);
      const m = rest.match(/^\$[A-Za-z_0-9]*\$/);
      if (m && !dollarTag) {
        dollarTag = m[0];
        buf += m[0];
        i += m[0].length;
        continue;
      } else if (dollarTag && rest.startsWith(dollarTag)) {
        buf += dollarTag;
        i += dollarTag.length;
        dollarTag = null;
        continue;
      }
    }

    // Stringhe singole/doppie
    if (!dollarTag && (ch === "'" || ch === '"')) {
      if (!inString) { inString = true; stringChar = ch; }
      else if (ch === stringChar && sql[i-1] !== '\\') { inString = false; stringChar = null; }
      buf += ch;
      i++;
      continue;
    }

    if (!inString && !dollarTag) {
      if (ch === '(') parenDepth++;
      else if (ch === ')') parenDepth--;
      else if (ch === ';' && parenDepth === 0) {
        const s = buf.trim();
        if (s) statements.push(s);
        buf = '';
        i++;
        continue;
      }
    }
    buf += ch;
    i++;
  }
  if (buf.trim()) statements.push(buf.trim());
  return statements;
}

function makeIdempotent(stmt) {
  return stmt
    .replace(/^CREATE\s+TABLE\s+(?!IF\s+NOT\s+EXISTS)/i, 'CREATE TABLE IF NOT EXISTS ')
    .replace(/^CREATE\s+INDEX\s+(?!IF\s+NOT\s+EXISTS)/i, 'CREATE INDEX IF NOT EXISTS ')
    .replace(/^CREATE\s+UNIQUE\s+INDEX\s+(?!IF\s+NOT\s+EXISTS)/i, 'CREATE UNIQUE INDEX IF NOT EXISTS ')
    .replace(/^CREATE\s+EXTENSION\s+(?!IF\s+NOT\s+EXISTS)/i, 'CREATE EXTENSION IF NOT EXISTS ')
    .replace(/^CREATE\s+TYPE\s+(?!IF\s+NOT\s+EXISTS)/i, 'CREATE TYPE IF NOT EXISTS ')
    .replace(/^CREATE\s+TRIGGER\s+/i, 'CREATE OR REPLACE TRIGGER ');  // PG14+ supporta OR REPLACE
}

const statements = splitStatements(schema);
console.log(`statements totali (split robusto v2): ${statements.length}`);

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
        if (allErrors.length < 20) allErrors.push({ i: item.i, err: msg.substring(0, 150), preview: item.sql.substring(0, 80) });
      }
    }
  }
  console.log(`pass ${pass}: ok=${ok} fail=${fail} (stillPending=${stillPending.length})`);
  pending = stillPending;
  if (pending.length === 0) break;
  if (ok === 0) { console.log('  nessun progresso, fermo'); break; }
}

// Verifica
const t = await client.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename");
console.log(`\ntabelle create: ${t.rows.length}`);

const roles = await client.query("SELECT name, scope, is_protected FROM roles ORDER BY name");
console.log(`ruoli: ${roles.rows.length}`);
for (const r of roles.rows) console.log(`  - ${r.name} (scope=${r.scope}, protected=${r.is_protected})`);

const perms = await client.query("SELECT name FROM permissions ORDER BY name");
console.log(`\npermessi: ${perms.rows.length}`);

const rolePerms = await client.query("SELECT count(*)::int as n FROM role_permissions");
console.log(`role_permissions: ${rolePerms.rows[0].n}`);

const u = await client.query('SELECT count(*)::int as n FROM users');
console.log(`utenti totali: ${u.rows[0].n}`);

const trig = await client.query("SELECT tgname FROM pg_trigger WHERE tgname LIKE '%_touch' ORDER BY tgname");
console.log(`\ntrigger _touch: ${trig.rows.length}`);
for (const r of trig.rows) console.log(`  - ${r.tgname}`);

const fn = await client.query("SELECT proname FROM pg_proc WHERE proname = 'aura_touch_updated_at'");
console.log(`function aura_touch_updated_at: ${fn.rows.length ? 'esiste' : 'MANCANTE'}`);

if (allErrors.length) {
  console.log('\n--- altri errori (non FK forward) ---');
  for (const e of allErrors) console.log(`  #${e.i}: ${e.err}\n     stmt: ${e.preview}`);
}

await client.end();
