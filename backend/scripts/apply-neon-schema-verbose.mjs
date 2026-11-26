import { neon } from '@neondatabase/serverless';
import { readFileSync } from 'fs';

// Leggi .env.local manualmente
const envLocal = readFileSync('/home/z/my-project/scripts/aura-repo/.env.local', 'utf8');
for (const line of envLocal.split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
}

const sql = neon(process.env.DATABASE_URL_UNPOOLED);
const schema = readFileSync('/home/z/my-project/scripts/aura-repo/backend/db/schema.sql', 'utf8');

// Split manuale degli statements (gestione $$ blocks)
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

console.log(`statements totali: ${statements.length}`);
let ok = 0, fail = 0;
const errors = [];
for (let i = 0; i < statements.length; i++) {
  const stmt = statements[i];
  if (!stmt || stmt.startsWith('--')) continue;
  const preview = stmt.substring(0, 80).replace(/\n/g, ' ');
  try {
    await sql.unsafe(stmt);
    ok++;
    if (stmt.match(/^CREATE\s+(TABLE|INDEX|TYPE|FUNCTION|TRIGGER|EXTENSION|ROLE)/i)) {
      console.log(`  ✓ ${preview}`);
    }
  } catch (e) {
    fail++;
    const msg = (e.message || '').substring(0, 120).replace(/\n/g, ' ');
    console.log(`  ✗ #${i}: ${preview}`);
    console.log(`     ERR: ${msg}`);
    if (errors.length < 30) errors.push({ i, preview, msg });
  }
}
console.log(`\n=== RISULTATO: ok=${ok} fail=${fail} ===`);
