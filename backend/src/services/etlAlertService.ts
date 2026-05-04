import type { Pool, PoolClient } from 'pg';

export type AlertRuleRow = {
  recipients: string;
  strategy: string;
  cumulativeFailureThreshold?: number;
  successLateThanTime?: string;
  channel: string;
  alertTimeWindow?: string;
};

function parseTimeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(x => parseInt(x, 10));
  if (Number.isNaN(h) || Number.isNaN(m)) return 0;
  return h * 60 + m;
}

/** Returns scheduled time if send must be delayed; null if send may proceed immediately. */
export function resolveScheduledSendAt(alertTimeWindow: string | undefined, now: Date = new Date()): Date | null {
  const tw = (alertTimeWindow || '').trim();
  if (!tw) return null;
  const m = /^(\d{1,2}:\d{2})\s*~\s*(\d{1,2}:\d{2})$/.exec(tw);
  if (!m) return null;
  const startMin = parseTimeToMinutes(m[1].padStart(5, '0'));
  const endMin = parseTimeToMinutes(m[2].padStart(5, '0'));
  const nowMin = now.getHours() * 60 + now.getMinutes();
  if (endMin >= startMin) {
    if (nowMin >= startMin && nowMin <= endMin) return null;
  } else {
    if (nowMin >= startMin || nowMin <= endMin) return null;
  }
  const d = new Date(now);
  if (nowMin < startMin) {
    d.setHours(Math.floor(startMin / 60), startMin % 60, 0, 0);
  } else {
    d.setDate(d.getDate() + 1);
    d.setHours(Math.floor(startMin / 60), startMin % 60, 0, 0);
  }
  return d;
}

async function countFailuresSamePartitionDate(
  pool: Pool | PoolClient,
  etlTaskVersionId: number,
  partitionDateStr: string
): Promise<number> {
  const r = await pool.query(
    `SELECT COUNT(*)::int AS c FROM etl_task_run_instances
     WHERE etl_task_version_id = $1
       AND partition_date = $2::date AND status = 'failed'`,
    [etlTaskVersionId, partitionDateStr]
  );
  return r.rows[0]?.c ?? 0;
}

export async function enqueueAlertFromRules(params: {
  client: Pool | PoolClient;
  source: string;
  reason: string;
  etlTaskVersionId: number;
  taskInstanceId: number | null;
  partitionDate: Date;
  status: 'success' | 'failed' | 'running';
  endedAt: Date;
  rules: AlertRuleRow[];
}): Promise<void> {
  const { client, rules } = params;
  if (!rules.length) return;

  for (const rule of rules) {
    if (!rule.recipients.trim()) continue;

    let fire = false;
    let reason = params.reason;

    switch (rule.strategy) {
      case 'each_run_failure':
        fire = params.status === 'failed';
        break;
      case 'daily_run_failure':
        fire = params.status === 'failed';
        break;
      case 'daily_cumulative_failures': {
        if (params.status !== 'failed') break;
        const th = Math.max(1, Math.floor(rule.cumulativeFailureThreshold ?? 3));
        const d = params.partitionDate.toISOString().slice(0, 10);
        const c = await countFailuresSamePartitionDate(client, params.etlTaskVersionId, d);
        fire = c >= th;
        reason = `当天累计失败 ${c} 次，阈值 ${th}`;
        break;
      }
      case 'success_later_than_time': {
        if (params.status !== 'success') break;
        const hm = (rule.successLateThanTime || '09:00').trim();
        const limitMin = parseTimeToMinutes(hm);
        const end = params.endedAt;
        const endMin = end.getHours() * 60 + end.getMinutes();
        fire = endMin > limitMin;
        if (fire) reason = `成功时间晚于 ${hm}`;
        break;
      }
      default:
        fire = params.status === 'failed';
    }

    if (!fire) continue;

    const sched = resolveScheduledSendAt(rule.alertTimeWindow);
    await client.query(
      `INSERT INTO etl_alert_dispatch
        (source, etl_task_version_id, task_instance_id, reason, payload_json, channel, scheduled_send_at, send_status)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, 'pending')`,
      [
        params.source,
        params.etlTaskVersionId,
        params.taskInstanceId,
        reason,
        JSON.stringify({ recipients: rule.recipients.trim(), strategy: rule.strategy, snapshot: rule }),
        rule.channel || 'im_webhook',
        sched ? sched.toISOString() : null,
      ]
    );
  }
}

export async function deliverPendingAlerts(client: Pool | PoolClient, limit: number): Promise<{ processed: number }> {
  const sel = await client.query(
    `SELECT id, payload_json, channel, reason FROM etl_alert_dispatch
     WHERE send_status = 'pending'
       AND (scheduled_send_at IS NULL OR scheduled_send_at <= CURRENT_TIMESTAMP)
     ORDER BY created_at ASC
     LIMIT $1`,
    [limit]
  );

  let processed = 0;
  for (const row of sel.rows) {
    const id = row.id as number;
    try {
      console.info('[etl_alert_dispatch] deliver', {
        id,
        channel: row.channel,
        reason: row.reason,
        payload: row.payload_json,
      });
      await client.query(
        `UPDATE etl_alert_dispatch SET send_status = 'sent', sent_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [id]
      );
      processed += 1;
    } catch (e) {
      console.error('[etl_alert_dispatch] failed', id, e);
      await client.query(`UPDATE etl_alert_dispatch SET send_status = 'failed' WHERE id = $1`, [id]);
    }
  }
  return { processed };
}

export function parseAlertRulesFromOptions(airflowOptions: unknown): AlertRuleRow[] {
  if (!airflowOptions || typeof airflowOptions !== 'object') return [];
  const ao = airflowOptions as Record<string, unknown>;
  const ar = ao.alertRules ?? ao.rules;
  if (!Array.isArray(ar)) return [];
  const out: AlertRuleRow[] = [];
  for (const item of ar) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    out.push({
      recipients: typeof o.recipients === 'string' ? o.recipients : '',
      strategy: typeof o.strategy === 'string' ? o.strategy : 'each_run_failure',
      cumulativeFailureThreshold:
        typeof o.cumulativeFailureThreshold === 'number' ? o.cumulativeFailureThreshold : 3,
      successLateThanTime: typeof o.successLateThanTime === 'string' ? o.successLateThanTime : '09:00',
      channel: typeof o.channel === 'string' ? o.channel : 'im_webhook',
      alertTimeWindow: typeof o.alertTimeWindow === 'string' ? o.alertTimeWindow : '',
    });
  }
  return out;
}
