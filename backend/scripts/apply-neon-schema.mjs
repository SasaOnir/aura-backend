import { neon } from '@neondatabase/serverless';
import { readFileSync } from 'fs';

// Carica .env.local del root (uscito da /tmp → uso path assoluto)
import { config as loadEnv } from 'dotenv';
loadEnv('/home/z/my-project/scripts/aura-repo/.env.local');

const sql = neon(process.env.DATABASE_URL_UNPOOLED);
const schema = readFileSync('/home/z/my-project/scripts/aura-repo/backend/db/schema.sql', 'utf8');

// Split manuale degli statements (gestione $$ blocks per function bodies)
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

console.log(`statements da eseguire: ${statements.length}`);
let ok = 0, skipped = 0, fail = 0;
const errors = [];
for (let i = 0; i < statements.length; i++) {
  const stmt = statements[i];
  if (!stmt || stmt.startsWith('--')) continue;
  try {
    await sql.unsafe(stmt);
    ok++;
  } catch (e) {
    const msg = e.message || '';
    if (/already exists|duplicate key|does not exist|cannot use.*during transaction/i.test(msg)) {
      skipped++;
    } else {
      fail++;
      if (errors.length < 10) errors.push(`stmt#${i}: ${msg.substring(0, 150)}`);
    }
  }
}
console.log(`ok=${ok} skipped=${skipped} fail=${fail}`);
if (errors.length) {
  console.log('--- primi errori ---');
  for (const e of errors) console.log(e);
}

// Verifica: conta tabelle principali create
const tables = await sql`SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename`;
console.log(`tabelle create: ${tables.length}`);
for (const t of tables.slice(0, 30)) console.log(`  - ${t.tablename}`);
