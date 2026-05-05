/**
 * Airflow REST 共用：Base URL、API 版本、JWT/Basic 认证头。
 * 与 unpause / backfill 等调用共享。
 */

export function getAirflowRestBaseUrl(): string {
  return (process.env.AIRFLOW_REST_BASE_URL || '').trim().replace(/\/$/, '');
}

export function getAirflowApiVersion(): string {
  return (process.env.AIRFLOW_REST_API_VERSION || 'v2').trim().toLowerCase();
}

/** DAG 资源前缀：v2 = Airflow 3 */
export function airflowDagsResourcePrefix(): string {
  return getAirflowApiVersion() === 'v1' ? '/api/v1/dags' : '/api/v2/dags';
}

export function isAirflowRestConfigured(): boolean {
  return getAirflowRestBaseUrl().length > 0;
}

/**
 * Airflow 3：Bearer JWT；Airflow 2：Basic。
 */
export async function buildAirflowAuthorizationHeader(): Promise<string | null> {
  const base = getAirflowRestBaseUrl();
  if (!base) return null;

  const preset = (process.env.AIRFLOW_REST_TOKEN || '').trim();
  if (preset) {
    return preset.toLowerCase().startsWith('bearer ') ? preset : `Bearer ${preset}`;
  }

  const user = (process.env.AIRFLOW_REST_USERNAME || '').trim();
  const pass = (process.env.AIRFLOW_REST_PASSWORD || '').trim();

  if (getAirflowApiVersion() === 'v1') {
    if (!user && !pass) return null;
    return `Basic ${Buffer.from(`${user}:${pass}`, 'utf8').toString('base64')}`;
  }

  if (!user || !pass) {
    return null;
  }

  const tokenUrl = `${base}/auth/token`;
  const tokenRes = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ username: user, password: pass }),
  });
  const raw = await tokenRes.text();
  if (!tokenRes.ok) {
    throw new Error(`Airflow auth/token HTTP ${tokenRes.status}: ${raw.slice(0, 280)}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    throw new Error('Airflow auth/token: response is not JSON');
  }
  const obj = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  const access =
    typeof obj.access_token === 'string'
      ? obj.access_token
      : typeof obj.accessToken === 'string'
        ? obj.accessToken
        : '';
  if (!access) {
    throw new Error('Airflow auth/token: missing access_token in response');
  }
  return `Bearer ${access}`;
}
