/**
 * Calls the standalone Python FastAPI service that emits Airflow Task SDK–style DAG source.
 * Set ETL_DAG_PY_SERVICE_URL (default http://127.0.0.1:8790).
 */
import { generateDagPython } from './etlDagGenerator.js';
import type { AirflowOptions, QualityRule } from './etlDagTypes.js';

export interface DagGeneratePayload {
  versionId: number;
  logicalName: string;
  sqlMain: string;
  airflowOptions: AirflowOptions;
  qualityRules: QualityRule[];
  graphJson?: unknown;
}

export interface DagGenerateResult {
  dagId: string;
  pythonSource: string;
  generator: 'python_task_sdk' | 'node_fallback';
}

function serviceBaseUrl(): string {
  return (process.env.ETL_DAG_PY_SERVICE_URL || 'http://127.0.0.1:8790').replace(/\/$/, '');
}

export async function fetchDagPythonFromService(payload: DagGeneratePayload): Promise<DagGenerateResult> {
  const url = `${serviceBaseUrl()}/dag/generate`;
  const timeoutMs = parseInt(process.env.ETL_DAG_PY_SERVICE_TIMEOUT_MS || '30000', 10) || 30000;
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        versionId: payload.versionId,
        logicalName: payload.logicalName,
        sqlMain: payload.sqlMain,
        airflowOptions: payload.airflowOptions,
        qualityRules: payload.qualityRules,
        graphJson: payload.graphJson ?? {},
      }),
      signal: ac.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`DAG service HTTP ${res.status}: ${text.slice(0, 300)}`);
    }
    const body = (await res.json()) as { dagId?: string; pythonSource?: string };
    if (!body.pythonSource || !body.dagId) {
      throw new Error('DAG service returned invalid payload');
    }
    return { dagId: body.dagId, pythonSource: body.pythonSource, generator: 'python_task_sdk' };
  } finally {
    clearTimeout(t);
  }
}

export async function generateDagPythonWithFallback(payload: DagGeneratePayload): Promise<DagGenerateResult> {
  try {
    return await fetchDagPythonFromService(payload);
  } catch (e) {
    console.warn('ETL DAG Python service unavailable, using Node template fallback:', e);
    const py = generateDagPython(payload);
    const safe = payload.logicalName.replace(/[^a-zA-Z0-9_]+/g, '_').replace(/^_|_$/g, '') || 'task';
    const dagId = `etl_${safe}_${payload.versionId}`;
    return { dagId, pythonSource: py, generator: 'node_fallback' };
  }
}
