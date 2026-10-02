import fs from 'fs';
import path from 'path';
import { getDb } from './client.js';

export async function runMigrations() {
  const db = await getDb();
  
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT UNIQUE NOT NULL,
      applied_at TEXT NOT NULL
    );
  `);

  const migrationsDir = path.resolve('server/src/db/migrations');
  if (!fs.existsSync(migrationsDir)) {
    console.warn(`Migrations directory not found at: ${migrationsDir}`);
    return;
  }

  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const existing = db.prepare('SELECT id FROM _migrations WHERE filename = ?').get(file);
    if (!existing) {
      console.log(`Applying migration: ${file}`);
      let sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
      // SQLite does not support `ADD COLUMN IF NOT EXISTS`. Make additive
      // migrations safe to resume if a prior run applied the schema change
      // but was interrupted before recording the migration filename.
      sql = sql.replace(/^ALTER\s+TABLE\s+(\w+)\s+ADD\s+COLUMN\s+(\w+)\s+([^;]+);\s*$/gim,
        (statement, table: string, column: string) => {
          const columns = db.prepare<any>(`PRAGMA table_info(${table})`).all();
          if (columns.some(row => row.name === column)) return '';
          return statement;
        });
      db.exec(sql);
      db.prepare('INSERT INTO _migrations (filename, applied_at) VALUES (?, ?)').run(
        file,
        new Date().toISOString()
      );
      console.log(`Applied migration: ${file}`);
    }
  }
}

// If run directly from CLI
if (process.argv[1]?.includes('migrate')) {
  runMigrations()
    .then(() => {
      console.log('Migrations completed successfully.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('Migration failed:', err);
      process.exit(1);
    });
}
