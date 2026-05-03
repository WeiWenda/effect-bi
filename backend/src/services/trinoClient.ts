/**
 * Trino REST client for Ad-hoc / ETL dry-run (decision: shared Trino engine).
 * Configure TRINO_URL (e.g. http://localhost:8080) + TRINO_USER; optional TRINO_CATALOG / TRINO_SCHEMA.
 */

export interface TrinoColumnMeta {
  name: string;
  type: string;
}

interface TrinoStatementResponse {
  id?: string;
  infoUri?: string;
  nextUri?: string | null;
  stats?: { state?: string };
  error?: { message: string; errorName?: string };
  columns?: TrinoColumnMeta[];
  data?: unknown[][];
}

function trinoBaseUrl(): string {
  return (process.env.TRINO_URL || process.env.TRINO_COORDINATOR_URL || '').replace(/\/$/, '');
}

export function isTrinoConfigured(): boolean {
  return Boolean(trinoBaseUrl());
}

function trinoHeaders(): Record<string, string> {
  const user = process.env.TRINO_USER || 'etl-chatbot';
  const catalog = process.env.TRINO_CATALOG || 'hive';
  const schema = process.env.TRINO_SCHEMA || '';
  const h: Record<string, string> = {
    'X-Trino-User': user,
    'X-Trino-Catalog': catalog,
    'X-Trino-Source': 'chatbot-backend',
    Accept: 'application/json',
  };
  if (schema) {
    h['X-Trino-Schema'] = schema;
  }
  return h;
}

const MAX_POLL = 800;
const POLL_MS = 80;

async function sleep(ms: number): Promise<void> {
  await new Promise<void>(r => setTimeout(r, ms));
}

async function fetchJson(url: string, init?: RequestInit): Promise<TrinoStatementResponse> {
  const timeoutMs = parseInt(process.env.TRINO_CLIENT_TIMEOUT_MS || '120000', 10) || 120000;
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: ac.signal });
    const text = await res.text();
    if (!text) return {};
    try {
      return JSON.parse(text) as TrinoStatementResponse;
    } catch {
      throw new Error(`Trino non-JSON response (${res.status}): ${text.slice(0, 200)}`);
    }
  } finally {
    clearTimeout(t);
  }
}

export async function executeTrinoQuery(sql: string): Promise<{
  columns: TrinoColumnMeta[];
  rows: Record<string, unknown>[];
  rowCount: number;
}> {
  const base = trinoBaseUrl();
  if (!base) {
    throw new Error('Trino is not configured (set TRINO_URL)');
  }

  const headers: Record<string, string> = {
    ...trinoHeaders(),
    'Content-Type': 'text/plain; charset=UTF-8',
  };

  let json = await fetchJson(`${base}/v1/statement`, {
    method: 'POST',
    headers,
    body: sql,
  });

  const rowBuffers: unknown[][] = [];
  let columns: TrinoColumnMeta[] = [];

  for (let i = 0; i < MAX_POLL; i++) {
    if (json.error) {
      throw new Error(json.error.message || 'Trino query failed');
    }
    if (json.columns?.length) {
      columns = json.columns;
    }
    if (json.data?.length) {
      rowBuffers.push(...json.data);
    }

    if (json.nextUri) {
      await sleep(POLL_MS);
      json = await fetchJson(json.nextUri, { headers: trinoHeaders() });
      continue;
    }

    const state = json.stats?.state;
    if (state === 'FAILED') {
      throw new Error(json.error?.message || 'Trino query failed');
    }
    if (state === 'FINISHED' || state === 'CANCELED') {
      break;
    }
    await sleep(POLL_MS);
  }

  const maxRows = Math.min(parseInt(process.env.TRINO_MAX_ROWS || '500', 10) || 500, 5000);
  const limited = rowBuffers.slice(0, maxRows);
  const colNames = (columns.length > 0 ? columns : []).map(c => c.name);
  const rows: Record<string, unknown>[] = limited.map(cells => {
    const rec: Record<string, unknown> = {};
    colNames.forEach((name, idx) => {
      rec[name] = cells[idx] ?? null;
    });
    return rec;
  });

  return {
    columns: columns.length > 0 ? columns : colNames.map(n => ({ name: n, type: 'unknown' })),
    rows,
    rowCount: rowBuffers.length,
  };
}
