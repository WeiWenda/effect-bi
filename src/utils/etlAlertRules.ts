/** 任务报警（API 字段 alertJson.rules，对应 DB alert_json） */

export const ALERT_STRATEGIES = [
  'each_run_failure',
  'daily_cumulative_failures',
  'daily_run_failure',
  'success_later_than_time',
] as const;
export type AlertStrategy = (typeof ALERT_STRATEGIES)[number];

export const ALERT_STRATEGY_LABELS: Record<AlertStrategy, string> = {
  each_run_failure: '每次运行失败',
  daily_cumulative_failures: '当天累计失败',
  daily_run_failure: '当天运行失败',
  success_later_than_time: '运行成功晚于指定时刻',
};

export const ALERT_CHANNELS = ['im_webhook', 'sms', 'phone'] as const;
export type AlertChannel = (typeof ALERT_CHANNELS)[number];

export const ALERT_CHANNEL_LABELS: Record<AlertChannel, string> = {
  im_webhook: 'IM Webhook',
  sms: '短信',
  phone: '电话',
};

export interface EtlAlertRuleRow {
  /** 报警接收人（如账号、手机、邮箱，多个可用逗号分隔） */
  recipients: string;
  strategy: AlertStrategy;
  /** 当 strategy 为 daily_cumulative_failures 时：当天累计失败次数阈值 */
  cumulativeFailureThreshold: number;
  /** 当 strategy 为 success_later_than_time 时：运行成功若晚于该时刻（当天 HH:mm）则报警 */
  successLateThanTime: string;
  channel: AlertChannel;
  /**
   * 报警时段：空表示全天；
   * 填写示例 `09:00~18:00` 表示触发后延迟至该时段内发送
   */
  alertTimeWindow: string;
}

export interface EtlAlertRulesBundle {
  rules: EtlAlertRuleRow[];
}

export function defaultAlertRulesBundle(): EtlAlertRulesBundle {
  return { rules: [] };
}

export function emptyAlertRule(): EtlAlertRuleRow {
  return {
    recipients: '',
    strategy: 'each_run_failure',
    cumulativeFailureThreshold: 3,
    successLateThanTime: '09:00',
    channel: 'im_webhook',
    alertTimeWindow: '',
  };
}

/** 24h HH:mm */
const HM_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

export function isValidHHmm(s: string): boolean {
  const t = s.trim();
  return t === '' ? false : HM_REGEX.test(t);
}

function isStrategy(x: unknown): x is AlertStrategy {
  return typeof x === 'string' && (ALERT_STRATEGIES as readonly string[]).includes(x);
}

function isChannel(x: unknown): x is AlertChannel {
  return typeof x === 'string' && (ALERT_CHANNELS as readonly string[]).includes(x);
}

function normalizeRule(o: unknown): EtlAlertRuleRow | null {
  if (!o || typeof o !== 'object') return null;
  const r = o as Record<string, unknown>;
  const recipients = typeof r.recipients === 'string' ? r.recipients : '';
  const strategy = isStrategy(r.strategy) ? r.strategy : 'each_run_failure';
  const rawT = r.cumulativeFailureThreshold;
  let cumulativeFailureThreshold = 3;
  if (typeof rawT === 'number' && Number.isFinite(rawT) && rawT >= 1) {
    cumulativeFailureThreshold = Math.floor(rawT);
  } else if (typeof rawT === 'string' && rawT.trim() !== '') {
    const n = parseInt(rawT, 10);
    if (Number.isFinite(n) && n >= 1) cumulativeFailureThreshold = n;
  }
  const channel = isChannel(r.channel) ? r.channel : 'im_webhook';
  const alertTimeWindow = typeof r.alertTimeWindow === 'string' ? r.alertTimeWindow : '';
  let successLateThanTime =
    typeof r.successLateThanTime === 'string' && HM_REGEX.test(r.successLateThanTime.trim())
      ? r.successLateThanTime.trim()
      : '09:00';
  const altKey = r.successLateTime ?? r.lateSuccessTime;
  if (typeof altKey === 'string' && HM_REGEX.test(altKey.trim())) {
    successLateThanTime = altKey.trim();
  }
  return {
    recipients,
    strategy,
    cumulativeFailureThreshold,
    successLateThanTime,
    channel,
    alertTimeWindow,
  };
}

export function parseAlertRulesFromJsonText(text: string): EtlAlertRulesBundle {
  try {
    const p = JSON.parse(text || '{}') as unknown;
    if (!p || typeof p !== 'object') return defaultAlertRulesBundle();
    const obj = p as Record<string, unknown>;
    const rawRules = obj.rules;
    const rules: EtlAlertRuleRow[] = [];
    if (Array.isArray(rawRules)) {
      for (const item of rawRules) {
        const nr = normalizeRule(item);
        if (nr) rules.push(nr);
      }
    }
    return { rules };
  } catch {
    return defaultAlertRulesBundle();
  }
}

/** 自 API：alertRules 数组 */
export function parseAlertRulesFromAirflowOptions(ao: Record<string, unknown>): EtlAlertRulesBundle {
  const ar = ao.alertRules;
  if (!Array.isArray(ar)) return defaultAlertRulesBundle();
  const rules: EtlAlertRuleRow[] = [];
  for (const item of ar) {
    const nr = normalizeRule(item);
    if (nr) rules.push(nr);
  }
  return { rules };
}

export function alertRulesBundleToJsonText(bundle: EtlAlertRulesBundle): string {
  const cleaned = bundle.rules
    .filter(r => r.recipients.trim().length > 0)
    .map(r => {
      const row: Record<string, unknown> = {
        recipients: r.recipients.trim(),
        strategy: r.strategy,
        channel: r.channel,
      };
      if (r.strategy === 'daily_cumulative_failures') {
        row.cumulativeFailureThreshold = Math.max(1, Math.floor(r.cumulativeFailureThreshold || 1));
      }
      if (r.strategy === 'success_later_than_time') {
        row.successLateThanTime = r.successLateThanTime.trim();
      }
      const tw = r.alertTimeWindow.trim();
      if (tw) row.alertTimeWindow = tw;
      return row;
    });
  return JSON.stringify({ rules: cleaned });
}

/** 每条规则一行简明文案（用于右栏摘要） */
export function formatAlertRulesSummaryLines(bundle: EtlAlertRulesBundle): string[] {
  return bundle.rules
    .filter(r => r.recipients.trim())
    .map(r => {
      const rec = r.recipients.trim();
      const recShort = rec.length > 24 ? `${rec.slice(0, 22)}…` : rec;
      let strat = ALERT_STRATEGY_LABELS[r.strategy];
      if (r.strategy === 'daily_cumulative_failures') {
        strat = `${ALERT_STRATEGY_LABELS.daily_cumulative_failures}${r.cumulativeFailureThreshold}次`;
      }
      if (r.strategy === 'success_later_than_time') {
        strat = `成功晚于 ${r.successLateThanTime.trim()}`;
      }
      const ch = ALERT_CHANNEL_LABELS[r.channel];
      const tw = r.alertTimeWindow.trim();
      const timeLabel = tw ? `时段 ${tw}` : '全天';
      return `${recShort} · ${strat} · ${ch} · ${timeLabel}`;
    });
}
