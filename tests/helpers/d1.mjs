import { SyncQuota } from '../../server/quota.js';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';

export class D1 {
  constructor() {
    this.db = new DatabaseSync(':memory:');
    this.db.exec(readFileSync(new URL('../../server/schema.sql', import.meta.url), 'utf8'));
    this.queries = 0;
  }
  prepare(sql) {
    const statement = this.db.prepare(sql);
    let params = [];
    const run = () => {
      this.queries++;
      const rows = statement.columns().length
        ? statement.all(...params)
        : (statement.run(...params), []);
      const size = this.physical ?? this.db.prepare('PRAGMA page_count').get().page_count * 4096;
      return {
        results: rows,
        meta: {
          size_after: size,
          rows_read: rows.length + 1,
          rows_written: /^(INSERT|UPDATE|DELETE)/i.test(sql.trim()) ? 1 : 0,
        },
      };
    };
    const query = {
      bind(...values) {
        params = values;
        return query;
      },
      run: async () => run(),
      all: async () => run(),
      first: async () => run().results[0] ?? null,
      _run: run,
    };
    return query;
  }
  async batch(statements) {
    this.db.exec('BEGIN');
    try {
      const results = statements.map((statement) => statement._run());
      this.db.exec('COMMIT');
      return results;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
  close() {
    this.db.close();
  }
}

export function quotaBinding(env = {}) {
  const db = new DatabaseSync(':memory:');
  const sql = {
    exec(text, ...params) {
      const statement = db.prepare(text);
      const rows = statement.columns().length
        ? statement.all(...params)
        : (statement.run(...params), []);
      return {
        toArray: () => rows,
        one: () => {
          if (rows.length !== 1) throw new Error('Expected one row');
          return rows[0];
        },
      };
    },
  };
  const ctx = {
    storage: {
      sql,
      transactionSync(action) {
        db.exec('BEGIN');
        try {
          const result = action();
          db.exec('COMMIT');
          return result;
        } catch (error) {
          db.exec('ROLLBACK');
          throw error;
        }
      },
    },
  };
  const object = new SyncQuota(ctx, env);
  return {
    object,
    db,
    idFromName: (name) => name,
    get: () => ({ fetch: (url, init) => object.fetch(new Request(url, init)) }),
  };
}
