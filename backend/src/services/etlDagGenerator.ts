/**
 * Renders Airflow DAG Python source (Task SDK / decorators + globals()[dag_id] registration).
 * Formerly produced by services/etl-dag-service; kept in Node for a single deploy surface.
 */
import type { AirflowOptions, DagGeneratePayload } from './etlDagTypes.js';

export function slugForDagId(name: string, versionId: number): string {
  const safe = name.replace(/[^a-zA-Z0-9_]+/g, '_').replace(/^_|_$/g, '') || 'task';
  return `etl_${safe}_${versionId}`;
}

function sqlAsComments(sql: string): string {
  if (!sql.trim()) return '# (empty SQL)';
  return sql
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => `# ${line}`)
    .join('\n');
}

function runtimeDeps(rtObj: Record<string, unknown>): Record<string, unknown>[] {
  const rd = rtObj.runtimeDependencies;
  if (!Array.isArray(rd)) return [];
  return rd.filter((x): x is Record<string, unknown> => typeof x === 'object' && x !== null);
}

function hasQualityTasks(qr: unknown): boolean {
  if (!qr || typeof qr !== 'object' || Array.isArray(qr)) return false;
  const o = qr as Record<string, unknown>;
  const rules = o.rules;
  const sqlQueries = o.sqlQueries;
  if (!Array.isArray(rules) || rules.length === 0) return false;
  if (!Array.isArray(sqlQueries)) return false;
  return sqlQueries.some((s) => typeof s === 'string' && s.trim().length > 0);
}

/** Embed JSON as `json.loads("...")` so booleans/null are valid in Python. */
function pyLoadsConst(varName: string, value: unknown): string {
  const json = JSON.stringify(value ?? {});
  return `${varName} = json.loads(${JSON.stringify(json)})`;
}

export function renderDagPython(payload: DagGeneratePayload): { dagId: string; pythonSource: string } {
  const dagId = slugForDagId(payload.logicalName, payload.versionId);
  const opts = (payload.airflowOptions || {}) as AirflowOptions;
  const retries = typeof opts.retries === 'number' ? opts.retries : 1;
  const retryDelayMinutes = typeof opts.retryDelayMinutes === 'number' ? opts.retryDelayMinutes : 5;
  const emailOnFailure = opts.emailOnFailure === true;
  const owner = (opts.owner && String(opts.owner).slice(0, 64)) || 'etl';

  const rtObj =
    payload.runtimeDepsJson && typeof payload.runtimeDepsJson === 'object' && !Array.isArray(payload.runtimeDepsJson)
      ? (payload.runtimeDepsJson as Record<string, unknown>)
      : {};
  const deps = runtimeDeps(rtObj);
  const qTasks = hasQualityTasks(payload.qualityRules);

  const qualObj = payload.qualityRules ?? {};
  const cronExpr = String(opts.cronExpression ?? '').trim();
  // Airflow 3 / Task SDK: use `schedule` (not `schedule_interval` on DAG.__init__)
  const schedulePart = cronExpr
    ? `    schedule=${JSON.stringify(cronExpr)},`
    : '    schedule=None,';

  const alertRules = opts.alertRules ?? [];
  const fnName = `${dagId}_workflow`;
  const sqlComments = sqlAsComments(payload.sqlMain);

  const lines: string[] = [
    `"""ETL DAG — runtime dependency polling + main + optional quality.`,
    `Logical task: ${payload.logicalName}`,
    `Version id: ${payload.versionId}`,
    'Registered via globals()[dag_id] so Airflow picks up the DAG at parse time.',
    '"""',
    'from __future__ import annotations',
    '',
    'import json',
    'import os',
    'import re',
    'import time',
    'import urllib.request',
    'from datetime import datetime, timedelta, timezone',
    '',
    'try:',
    '    from airflow.decorators import dag, task',
    'except ImportError:  # pragma: no cover — Airflow 3 Task SDK',
    '    from airflow.sdk import dag, task  # type: ignore',
    '',
    '# start_date: use stdlib datetime only (Airflow 3 may remove airflow.utils.dates.days_ago)',
    '',
    pyLoadsConst('RUNTIME_DEPS_JSON', rtObj),
    pyLoadsConst('QUALITY_RULES_JSON', qualObj),
    `CRON_EXPRESSION = ${JSON.stringify(String(opts.cronExpression ?? ''))}`,
    pyLoadsConst('ALERT_RULES_JSON', alertRules),
    '',
    'ETL_BACKEND_URL = os.environ.get("ETL_BACKEND_URL", "http://127.0.0.1:3001")',
    `ETL_TASK_VERSION_ID = ${payload.versionId}`,
    '',
    'def _post_json(path: str, payload: dict) -> dict:',
    '    url = ETL_BACKEND_URL.rstrip("/") + path',
    '    data = json.dumps(payload).encode("utf-8")',
    '    req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"}, method="POST")',
    '    with urllib.request.urlopen(req, timeout=120) as resp:',
    '        return json.loads(resp.read().decode("utf-8"))',
    '',
    'def _patch_json(path: str, payload: dict) -> dict:',
    '    url = ETL_BACKEND_URL.rstrip("/") + path',
    '    data = json.dumps(payload).encode("utf-8")',
    '    req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"}, method="PATCH")',
    '    with urllib.request.urlopen(req, timeout=120) as resp:',
    '        return json.loads(resp.read().decode("utf-8"))',
    '',
    'def _resolve_partition_key(partition_expr: str, logical_iso: str) -> str:',
    '    expr = (partition_expr or "").strip()',
    '    m = re.match(r"^-\\s*(\\d+)\\s*day$", expr, re.I)',
    '    if m:',
    '        n = int(m.group(1))',
    '        d = datetime.fromisoformat(logical_iso.replace("Z", "+00:00"))',
    '        d = d.astimezone(timezone.utc) - timedelta(days=n)',
    '        return d.strftime("%Y-%m-%d")',
    '    if re.match(r"^\\d{4}-\\d{2}-\\d{2}$", expr):',
    '        return expr',
    '    return expr',
    '',
    'def _normalize_secondary(raw: str) -> str:',
    '    parts = sorted({p.strip() for p in (raw or "").split(",") if p.strip()})',
    '    return ",".join(parts)',
    '',
    'def _poll_upstream_ready(dep: dict, logical_iso: str) -> None:',
    '    body = {',
    '        "database": (dep.get("database") or dep.get("schema") or ""),',
    '        "table": dep.get("table") or "",',
    '        "partition": dep.get("partition") or "",',
    '        "secondaryPartitions": dep.get("secondaryPartitions") or "",',
    '        "logicalDate": logical_iso,',
    '    }',
    '    catalog = dep.get("catalog")',
    '    if isinstance(catalog, str) and catalog.strip():',
    '        body["catalog"] = catalog.strip()',
    '    path = "/api/etl/runtime-deps/check-ready"',
    '    while True:',
    '        data = _post_json(path, body)',
    '        if data.get("ready") is True:',
    '            return',
    '        time.sleep(10)',
    '',
    '@dag(',
    `    dag_id=${JSON.stringify(dagId)},`,
    schedulePart,
    '    start_date=datetime(2024, 1, 1, tzinfo=timezone.utc),',
    '    catchup=False,',
    '    default_args={',
    `        "owner": ${JSON.stringify(owner)},`,
    '        "depends_on_past": False,',
    `        "email_on_failure": ${emailOnFailure ? 'True' : 'False'},`,
    `        "retries": ${retries},`,
    `        "retry_delay": timedelta(minutes=${retryDelayMinutes}),`,
    '    },',
    '    tags=["etl", "data_dependency", "quality", "generated", "task_sdk"],',
    ')',
    `def ${fnName}():`,
  ];

  const checkNames: string[] = [];
  for (let i = 0; i < deps.length; i++) {
    const dep = deps[i];
    const name = `check_dep_${i}_ready`;
    checkNames.push(name);
    const depJson = JSON.stringify(dep);
    lines.push(`    @task(task_id=${JSON.stringify(name)})`);
    lines.push(`    def ${name}(**ctx) -> None:`);
    lines.push(`        dep = json.loads(${JSON.stringify(depJson)})`);
    lines.push('        logical_iso = ctx["data_interval_end"].isoformat()');
    lines.push('        _poll_upstream_ready(dep, logical_iso)');
    lines.push('');
  }

  lines.push('    @task(task_id="main_transform")');
  lines.push('    def main_transform(**ctx) -> None:');
  lines.push('        logical_iso = ctx["data_interval_end"].isoformat()');
  lines.push('        partition_date = ctx["data_interval_end"].strftime("%Y-%m-%d")');
  lines.push('        out_expr = "-1 day"');
  lines.push('        resolved_primary = _resolve_partition_key(out_expr, logical_iso)');
  lines.push('        sec_raw = ""');
  lines.push('        secondary_norm = _normalize_secondary(sec_raw)');
  lines.push('        dr = ctx.get("dag_run")');
  lines.push('        start_body = {');
  lines.push('            "etlTaskVersionId": ETL_TASK_VERSION_ID,');
  lines.push('            "partitionDate": partition_date,');
  lines.push('            "airflowDagId": getattr(dr, "dag_id", "") if dr else "",');
  lines.push('            "airflowRunId": ctx.get("run_id") or (getattr(dr, "run_id", "") if dr else ""),');
  lines.push('            "airflowTaskId": "main_transform",');
  lines.push('            "tryNumber": ctx.get("ti").try_number if ctx.get("ti") else 1,');
  lines.push('            "logicalPartitionLabel": resolved_primary,');
  lines.push('            "startedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),');
  lines.push('        }');
  lines.push('        start = _post_json("/api/etl/task-runs/start", start_body)');
  lines.push('        tid = start["taskInstanceId"]');
  lines.push('        # ----- Replace with real transform (Trino / Spark); SQL reference below -----');
  for (const cl of sqlComments.split('\n')) {
    lines.push(`        ${cl}`);
  }
  lines.push('        # ---------------------------------------------------------------------');
  lines.push('        end_body = {');
  lines.push('            "status": "success",');
  lines.push('            "endedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),');
  lines.push('            "resolvedPrimaryPartitionKey": resolved_primary,');
  lines.push('            "resolvedSecondaryPartitionKey": secondary_norm,');
  lines.push('        }');
  lines.push('        _patch_json(f"/api/etl/task-runs/{tid}/complete", end_body)');
  lines.push('');

  if (qTasks) {
    lines.push('    @task(task_id="quality_gate")');
    lines.push('    def quality_gate(**ctx) -> None:');
    lines.push('        logical_iso = ctx["data_interval_end"].isoformat()');
    lines.push('        out_expr = "-1 day"');
    lines.push('        primary = _resolve_partition_key(out_expr, logical_iso)');
    lines.push('        sec_raw = ""');
    lines.push('        secondary_norm = _normalize_secondary(sec_raw)');
    lines.push('        body = {');
    lines.push('            "etlTaskVersionId": ETL_TASK_VERSION_ID,');
    lines.push('            "logicalDate": logical_iso,');
    lines.push('            "primaryPartitionKey": primary,');
    lines.push('            "secondaryPartitionKey": secondary_norm,');
    lines.push('        }');
    lines.push('        _post_json("/api/etl/quality/execute", body)');
    lines.push('');
  }

  if (!deps.length && !qTasks) {
    lines.push("    @task(task_id='noop')");
    lines.push('    def noop() -> None:');
    lines.push('        return None');
    lines.push('    noop()');
  } else if (!deps.length) {
    lines.push('    t_main = main_transform()');
    if (qTasks) {
      lines.push('    t_q = quality_gate()');
      lines.push('    t_main >> t_q');
    }
  } else {
    for (let i = 0; i < checkNames.length; i++) {
      lines.push(`    t_chk_${i} = ${checkNames[i]}()`);
    }
    lines.push('    t_main = main_transform()');
    for (let i = 0; i < checkNames.length; i++) {
      lines.push(`    t_chk_${i} >> t_main`);
    }
    if (qTasks) {
      lines.push('    t_q = quality_gate()');
      lines.push('    t_main >> t_q');
    }
  }

  lines.push('');
  lines.push(`globals()[${JSON.stringify(dagId)}] = ${fnName}()`);
  lines.push('');

  return { dagId, pythonSource: lines.join('\n') };
}
