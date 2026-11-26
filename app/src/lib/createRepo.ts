import * as SQLite from 'expo-sqlite';
import { SqlRepo, type Repo, type SqlDb } from '@spaced/core';

function adapt(db: SQLite.SQLiteDatabase): SqlDb {
  return {
    exec: (sql) => db.execAsync(sql),
    run: async (sql, params = []) => {
      const r = await db.runAsync(sql, params);
      return { lastInsertRowId: r.lastInsertRowId, changes: r.changes };
    },
    all: <T,>(sql: string, params: (string | number | null)[] = []) => db.getAllAsync<T & object>(sql, params) as Promise<T[]>,
    transaction: (fn) => db.withTransactionAsync(fn),
  };
}

/** Native: all data lives in one local SQLite file. */
export async function createRepo(): Promise<Repo> {
  const db = await SQLite.openDatabaseAsync('spaced-cards.db');
  const repo = new SqlRepo(adapt(db));
  await repo.init();
  return repo;
}
