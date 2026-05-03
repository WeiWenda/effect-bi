/**
 * Shared SQL execution for Ad-hoc and ETL task dry-run.
 * Uses Trino when TRINO_URL (or TRINO_COORDINATOR_URL) is set; otherwise mock.
 */
import { executeTrinoQuery, isTrinoConfigured } from './trinoClient.js';

export interface QueryColumn {
  name: string;
  type: string;
}

export interface QueryRunResult {
  columns: QueryColumn[];
  rows: Record<string, unknown>[];
  rowCount: number;
}

const MAX_PREVIEW_ROWS = 500;

/** Reject multiple statements (naive split on `;`). */
export function assertSingleSqlStatement(sql: string): void {
  const parts = sql
    .split(';')
    .map(s => s.trim())
    .filter(Boolean);
  if (parts.length > 1) {
    throw new Error('Multiple SQL statements are not allowed');
  }
}

export async function executeSqlMock(sql: string): Promise<QueryRunResult> {
  const trimmed = sql.trim();
  if (!trimmed) {
    return { columns: [], rows: [], rowCount: 0 };
  }
  await new Promise<void>(resolve => {
    setTimeout(resolve, 40);
  });
  const snippet = trimmed.length > 120 ? `${trimmed.slice(0, 120)}…` : trimmed;
  return {
    columns: [
      { name: '_mock_col', type: 'varchar' },
      { name: '_note', type: 'varchar' },
    ],
    rows: [
      {
        _mock_col: 1,
        _note: `Mock (set TRINO_URL for Trino): ${snippet.replace(/\s+/g, ' ')}`,
      },
    ],
    rowCount: 1,
  };
}

/**
 * Production path: Trino if configured, else mock (local dev without cluster).
 */
export async function executeUserSql(sql: string): Promise<QueryRunResult> {
  assertSingleSqlStatement(sql);
  const trimmed = sql.trim();
  if (!trimmed) {
    return { columns: [], rows: [], rowCount: 0 };
  }
  if (isTrinoConfigured()) {
    const out = await executeTrinoQuery(trimmed);
    return {
      columns: out.columns,
      rows: out.rows,
      rowCount: out.rowCount,
    };
  }
  return executeSqlMock(trimmed);
}

export function trimRowsToPreview(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  return rows.slice(0, MAX_PREVIEW_ROWS);
}
