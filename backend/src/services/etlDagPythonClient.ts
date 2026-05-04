/**
 * ETL Airflow DAG generation (Python source as string). Rendered in-process; no sidecar service.
 */
import { renderDagPython } from './etlDagGenerator.js';
import type { DagGeneratePayload } from './etlDagTypes.js';

export type { DagGeneratePayload } from './etlDagTypes.js';

export interface DagGenerateResult {
  dagId: string;
  pythonSource: string;
  /** Source of the template (single path now) */
  generator: 'node';
}

export function generateDagPythonForPublish(payload: DagGeneratePayload): DagGenerateResult {
  const { dagId, pythonSource } = renderDagPython(payload);
  return { dagId, pythonSource, generator: 'node' };
}

/** @deprecated Use generateDagPythonForPublish; kept for call sites that still use the old name. */
export function generateDagPythonWithFallback(payload: DagGeneratePayload): DagGenerateResult {
  return generateDagPythonForPublish(payload);
}
