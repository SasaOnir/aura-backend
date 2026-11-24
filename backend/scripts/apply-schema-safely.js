#!/usr/bin/env node
/**
 * Applica db/schema.sql a un database Neon VUOTO in modo NON distruttivo.
 *
 * Usa DIRECT_URL (connessione diretta, non pooled) — best practice Neon
 * per DDL una tantum.
 *
 * Safety checks prima di eseguire:
 *   1. Verifica che il database sia vuoto (nessuna tabella in public)
 *   2. Se trova tabelle, SI FERMA e chiede conferma esplicita
 *   3. Esegue schema.sql in una transazione
 *   4. Verifica che le tabelle attese siano state create
 *
 * Uso: node scripts/apply-schema-safely.js
 * (richiede DIRECT_URL in env)
 */
const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

async function main() {
  const directUrl = process.env.DIRECT_URL;
  if (!directUrl) {
    console.error('FAIL: DIRECT_URL non impostata. Impostala in .env o env vars.');
    process.exit(2);
  }
  console.log('Connessione a Neon via DIRECT_URL (mascherata)...');
  console.log('  host:', directUrl.replace(/\/\/[^:]+:[^@]+@/, '//***:***@').replace(/@[^.]+/, '@***'));

  const prisma = new PrismaClient({ datasources: { db: { url: directUrl } } });

  // 1. verifica database vuoto
  const tables = await prisma.$queryRawUnsafe(`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;
  `);
  if (tables.length > 0) {
    console.error(`FAIL: il database NON e' vuoto. Trovate ${tables.length} tabelle:`);
    console.error(tables.map(t => `  - ${t.tablename}`).join('\n'));
    console.error('\nPer procedere su un database NON vuoto, elimina manualmente le tabelle');
    console.error('o crea un nuovo branch Neon. Lo script NON esegue DROP automatici.');
    await prisma.$disconnect();
    process.exit(3);
  }
  console.log(`OK: database vuoto (${tables.length} tabelle in public).`);

  // 2. carica ed esegui schema.sql
  const sqlPath = path.join(__dirname, '..', 'db', 'schema.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');
  console.log(`Eseguo schema.sql (${sql.length} bytes)...`);

  // 3. esegui in transazione — se fallisce, rollback
  try {
    await prisma.$executeRawUnsafe('BEGIN');
    // split su ; ma gestisci $$ ... $$ e '...'
    const statements = sql.split(/;(?=(?:[^"'$]*\$\$[^$]*\$\$)*[^"'$]*$)/);
    let count = 0;
    for (const stmt of statements) {
      const trimmed = stmt.trim();
      if (!trimmed || trimmed.startsWith('--')) continue;
      try {
        await prisma.$executeRawUnsafe(trimmed);
        count++;
      } catch (e) {
        // alcuni statement (es. CREATE EXTENSION) possono dare warning non fatali
        if (e.message.includes('already exists')) {
          console.log(`  skip (already exists): ${trimmed.substring(0, 50)}...`);
        } else {
          throw e;
        }
      }
    }
    await prisma.$executeRawUnsafe('COMMIT');
    console.log(`OK: ${count} statement eseguiti con successo.`);

    // 4. verifica tabelle create
    const createdTables = await prisma.$queryRawUnsafe(`
      SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;
    `);
    console.log(`Verifica: create ${createdTables.length} tabelle.`);
    if (createdTables.length < 20) {
      console.error(`WARN: numero tabelle basso (${createdTables.length}). Verifica lo schema.`);
    }
  } catch (e) {
    await prisma.$executeRawUnsafe('ROLLBACK').catch(() => {});
    console.error('FAIL durante esecuzione schema.sql. ROLLBACK eseguito.');
    console.error('errore:', e.message);
    await prisma.$disconnect();
    process.exit(4);
  }

  await prisma.$disconnect();
  console.log('DONE: schema applicato con successo al database Neon.');
}

main().catch(e => {
  console.error('UNEXPECTED ERROR:', e);
  process.exit(1);
});
