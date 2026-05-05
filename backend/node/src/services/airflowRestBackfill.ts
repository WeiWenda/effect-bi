/**
 * 发布后对 [调度开始日, 当前时间] 内「未完成」的区间发起 Airflow Backfill（REST）。
 * 使用 Airflow 3：POST /api/v2/backfills（及 dry_run 判断是否有可补跑区间）。
 * reprocess_behavior: failed = 缺跑 + 失败重跑（与 UI「未完成的调度」常见需求一致）。
 */

import {
  buildAirflowAuthorizationHeader,
  getAirflowApiVersion,
  getAirflowRestBaseUrl,
  isAirflowRestConfigured,
} from './airflowRestAuth.js';

/** 与 DAG start_date 一致：YYYY-MM-DD 按 UTC 日午夜；无效则退回当日 UTC 零点 */
function scheduleStartAsUtcDate(scheduleStartDateIso: string): Date {
  const s = (scheduleStartDateIso || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [ys, ms, ds] = s.split('-').map(Number);
    const t = Date.UTC(ys, ms - 1, ds);
    const chk = new Date(t);
    if (chk.getUTCFullYear() === ys && chk.getUTCMonth() === ms - 1 && chk.getUTCDate() === ds) {
      return new Date(Date.UTC(ys, ms - 1, ds, 0, 0, 0, 0));
    }
  }
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
}

export type PublishBackfillResult =
  | { skipped: true; reason: string; maxActiveRuns: number }
  | { ok: true; backfillId: number; maxActiveRuns: number }
  | { ok: false; error: string; maxActiveRuns: number };

function reprocessBehavior(): 'none' | 'failed' | 'completed' {
  const raw = (process.env.ETL_AIRFLOW_BACKFILL_REPROCESS || 'failed').trim().toLowerCase();
  if (raw === 'none' || raw === 'completed') return raw;
  return 'failed';
}

/**
 * 单次回填内允许并行 DAG Run 数（写入 POST /api/v2/backfills 的 max_active_runs）。
 * 须配置在 backend/.env（由 server 入口 loadEnv 加载），修改后需重启后端进程。
 */
export function readBackfillMaxActiveRuns(): number {
  const raw = process.env.ETL_AIRFLOW_BACKFILL_MAX_ACTIVE_RUNS;
  if (raw === undefined || raw === '') {
    return 16;
  }
  const trimmed = raw.trim().replace(/^["']|["']$/g, '');
  const n = parseInt(trimmed, 10);
  if (Number.isNaN(n) || n < 1) {
    console.warn(
      `[ETL backfill] ETL_AIRFLOW_BACKFILL_MAX_ACTIVE_RUNS=${JSON.stringify(raw)} is invalid; using 16`
    );
    return 16;
  }
  return Math.min(n, 256);
}

function buildBackfillPayload(dagId: string, from: Date, to: Date, maxActiveRuns: number) {
  return {
    dag_id: dagId,
    from_date: from.toISOString(),
    to_date: to.toISOString(),
    run_backwards: false,
    dag_run_conf: {} as Record<string, unknown>,
    reprocess_behavior: reprocessBehavior(),
    max_active_runs: maxActiveRuns,
    run_on_latest_version: true,
  };
}

/** true = 有可补跑区间；false = dry 成功且明确无区间；skip_check = dry 不可用或失败，仍尝试创建 backfill */
async function fetchDryRunWouldCreateRuns(
  base: string,
  headers: Record<string, string>,
  payload: ReturnType<typeof buildBackfillPayload>
): Promise<boolean | 'skip_check'> {
  const url = `${base}/api/v2/backfills/dry_run`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      return 'skip_check';
    }
    const data = (await res.json()) as { backfills?: unknown[]; total_entries?: number };
    const arr = Array.isArray(data.backfills) ? data.backfills : [];
    const n =
      typeof data.total_entries === 'number'
        ? data.total_entries
        : arr.length;
    return n > 0;
  } catch {
    return 'skip_check';
  }
}

/**
 * 在 unpause 成功后调用：仅 Airflow 3（api v2）；需配置 REST；需有效 cron；起始日早于当前时刻才有窗口。
 */
export async function triggerBackfillForPublishedDag(params: {
  dagId: string;
  scheduleStartDateIso: string;
  cronExpression: string;
}): Promise<PublishBackfillResult> {
  const maxActiveRuns = readBackfillMaxActiveRuns();

  if (!isAirflowRestConfigured()) {
    return { skipped: true, reason: 'rest_not_configured', maxActiveRuns };
  }
  if (getAirflowApiVersion() !== 'v2') {
    return { skipped: true, reason: 'api_v1_no_backfill', maxActiveRuns };
  }

  const cron = (params.cronExpression || '').trim();
  if (!cron) {
    return { skipped: true, reason: 'no_schedule', maxActiveRuns };
  }

  const base = getAirflowRestBaseUrl();
  let authHeader: string | null;
  try {
    authHeader = await buildAirflowAuthorizationHeader();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg, maxActiveRuns };
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
  if (authHeader) {
    headers.Authorization = authHeader;
  }

  const from = scheduleStartAsUtcDate(params.scheduleStartDateIso);
  const to = new Date();
  if (from.getTime() >= to.getTime()) {
    return { skipped: true, reason: 'no_time_window', maxActiveRuns };
  }

  const payload = buildBackfillPayload(params.dagId, from, to, maxActiveRuns);

  const dry = await fetchDryRunWouldCreateRuns(base, headers, payload);
  if (dry === false) {
    return { skipped: true, reason: 'nothing_to_backfill', maxActiveRuns };
  }

  const createUrl = `${base}/api/v2/backfills`;
  const maxAttempts = 5;
  const delayMs = 2000;
  let lastErr = 'unknown error';

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch(createUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });
      const text = await res.text();

      if (res.ok) {
        let id = 0;
        try {
          const body = JSON.parse(text) as { id?: number };
          id = typeof body.id === 'number' ? body.id : 0;
        } catch {
          /* ignore */
        }
        return { ok: true, backfillId: id, maxActiveRuns };
      }

      lastErr = `HTTP ${res.status}: ${text.slice(0, 300)}`;
      if ((res.status === 404 || res.status === 503) && attempt < maxAttempts) {
        await new Promise(r => setTimeout(r, delayMs));
        continue;
      }
      return { ok: false, error: lastErr, maxActiveRuns };
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e);
      if (attempt < maxAttempts) {
        await new Promise(r => setTimeout(r, delayMs));
        continue;
      }
      return { ok: false, error: lastErr, maxActiveRuns };
    }
  }

  return { ok: false, error: lastErr, maxActiveRuns };
}
