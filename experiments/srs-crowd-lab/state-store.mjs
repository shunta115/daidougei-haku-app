// One SRS host, multiple Node workers. A private SQLite file is the authority;
// never mount a database file on a network filesystem or expose its snapshots.
import { createRequire } from 'node:module';
import { openSync, closeSync, lstatSync } from 'node:fs';
import { isAbsolute } from 'node:path';

export const emptyCrowdState = () => ({ schema: 1, authority: null, dailyStarts: [], active: [], revocationPending: [], audience: [], watchSecret: null });
export function makeMemoryCrowdStore() {
  let state = emptyCrowdState();
  return { transaction(fn) { const next = structuredClone(state); const result = fn(next); if (result?.then) throw Error('synchronous_transaction_required'); state = next; return result; }, close() {} };
}
export function openSqliteCrowdStore(filename) {
  // Keep the in-memory policy harness usable on older Node releases; durable
  // gateways deliberately require a runtime with the built-in SQLite module.
  const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');
  if (!isAbsolute(filename) || filename === ':memory:') throw Error('private_absolute_state_path_required');
  try { closeSync(openSync(filename, 'wx', 0o600)); } catch (error) { if (error.code !== 'EEXIST') throw error; }
  const info = lstatSync(filename);
  if (!info.isFile() || info.isSymbolicLink() || (info.mode & 0o077)) throw Error('state_file_must_be_private');
  const db = new DatabaseSync(filename);
  db.exec('PRAGMA busy_timeout=5000; PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS crowd_state(id INTEGER PRIMARY KEY CHECK(id=1), payload TEXT NOT NULL);');
  const read = db.prepare('SELECT payload FROM crowd_state WHERE id=1');
  const write = db.prepare('INSERT INTO crowd_state(id,payload) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload');
  return {
    transaction(fn) {
      db.exec('BEGIN IMMEDIATE');
      try {
        const row = read.get();
        const state = row ? JSON.parse(row.payload) : emptyCrowdState();
        if (state.schema !== 1 || !Array.isArray(state.active) || !Array.isArray(state.dailyStarts) || !Array.isArray(state.revocationPending) || !Array.isArray(state.audience)) throw Error('invalid_crowd_state');
        const result = fn(state);
        if (result?.then) throw Error('synchronous_transaction_required');
        write.run(JSON.stringify(state)); db.exec('COMMIT'); return result;
      } catch (error) { db.exec('ROLLBACK'); throw error; }
    },
    close() { db.close(); },
  };
}
