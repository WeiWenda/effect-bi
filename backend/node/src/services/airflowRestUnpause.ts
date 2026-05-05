/**
 * ETL 发布后通过 Airflow REST API 将 DAG 设为「取消暂停」以开启调度。
 * 认证与环境变量见 airflowRestAuth.ts。
 */

import {
  airflowDagsResourcePrefix,
  buildAirflowAuthorizationHeader,
  getAirflowRestBaseUrl,
  isAirflowRestConfigured,
} from './airflowRestAuth.js';

export { isAirflowRestConfigured };

function dagVisibleWaitMs(): number {
  const raw = (process.env.ETL_AIRFLOW_DAG_VISIBLE_WAIT_MS || '').trim();
  const n = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(n) && n >= 0 ? n : 120_000;
}

function dagVisiblePollMs(): number {
  const raw = (process.env.ETL_AIRFLOW_DAG_VISIBLE_POLL_MS || '').trim();
  const n = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(n) && n >= 500 ? n : 3000;
}

/**
 * 写入 DAG 文件后，调度器需解析完毕 REST 才会返回该 dag_id；直接 PATCH 往往短时间 404。
 * 先 GET 轮询直到可见（或超时），再 unpause。
 */
async function waitUntilDagIsRegistered(params: {
  base: string;
  dagId: string;
  headers: Record<string, string>;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if ((process.env.ETL_AIRFLOW_SKIP_DAG_VISIBLE_WAIT || '').trim() === '1') {
    return { ok: true };
  }

  const prefix = airflowDagsResourcePrefix();
  const url = `${params.base}${prefix}/${encodeURIComponent(params.dagId)}`;
  const maxWait = dagVisibleWaitMs();
  const pollMs = dagVisiblePollMs();
  const start = Date.now();
  let last404Body = '';

  while (Date.now() - start < maxWait) {
    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: params.headers,
      });

      if (res.ok) {
        return { ok: true };
      }

      const text = await res.text();
      if (res.status === 404) {
        last404Body = text.slice(0, 280);
        await new Promise(r => setTimeout(r, pollMs));
        continue;
      }

      return {
        ok: false,
        error: `DAG 注册检查 HTTP ${res.status}: ${text.slice(0, 300)}`,
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await new Promise(r => setTimeout(r, pollMs));
      last404Body = msg;
    }
  }

  const hint =
    '请确认 ETL_AIRFLOW_DAGS_DIR（或 AIRFLOW_HOME/dags）与当前 AIRFLOW_REST_BASE_URL 指向的 Airflow 实例使用同一 DAG 目录；并检查生成的 .py 是否有语法错误导致无法加载。';
  return {
    ok: false,
    error: `在 ${maxWait}ms 内 Airflow 仍未注册 DAG ${params.dagId}（${last404Body || '连接失败'}）。${hint}`,
  };
}

export async function unpauseDagViaRestApi(dagId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const base = getAirflowRestBaseUrl();
  if (!base) {
    return { ok: true };
  }

  let authHeader: string | null;
  try {
    authHeader = await buildAirflowAuthorizationHeader();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }

  const url = `${base}${airflowDagsResourcePrefix()}/${encodeURIComponent(dagId)}`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
  if (authHeader) {
    headers.Authorization = authHeader;
  }

  const visible = await waitUntilDagIsRegistered({ base, dagId, headers });
  if (!visible.ok) {
    return visible;
  }

  const body = JSON.stringify({ is_paused: false });
  const maxAttempts = 5;
  const delayMs = 2000;

  let lastErr = 'unknown error';

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch(url, {
        method: 'PATCH',
        headers,
        body,
      });

      if (res.ok) {
        return { ok: true };
      }

      const text = await res.text();
      lastErr = `HTTP ${res.status}: ${text.slice(0, 300)}`;

      if ((res.status === 404 || res.status === 503) && attempt < maxAttempts) {
        await new Promise(r => setTimeout(r, delayMs));
        continue;
      }

      return { ok: false, error: lastErr };
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e);
      if (attempt < maxAttempts) {
        await new Promise(r => setTimeout(r, delayMs));
        continue;
      }
      return { ok: false, error: lastErr };
    }
  }

  return { ok: false, error: lastErr };
}
