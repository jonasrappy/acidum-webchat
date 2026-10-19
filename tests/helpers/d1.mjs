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
      return { results: rows, meta: { size_after: size } };
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
