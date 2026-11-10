import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { db } from '../config/db.js';
import { requireLocalDemoDatabase } from './local-only.js';

async function main() {
  requireLocalDemoDatabase();
  const sqlDirectory = resolve(process.cwd(), '..', 'database');
  for (const filename of ['01_schema.sql', '04_connectors.sql']) {
    const sql = await readFile(resolve(sqlDirectory, filename), 'utf8');
    await db.query(sql);
    console.log(`Estrutura verificada: ${filename}`);
  }
  console.log('Estrutura local pronta. Nenhum registro foi excluído.');
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : 'Falha ao preparar o banco.');
  process.exitCode = 1;
}).finally(() => db.end());
