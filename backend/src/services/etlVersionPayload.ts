import type { AirflowOptions } from './etlDagTypes.js';

/** 规范化写入 DB 的 runtime_deps_json */
export function normalizeRuntimeDepsForSave(runtimeDepsJson: unknown): Record<string, unknown> {
  const rd =
    runtimeDepsJson && typeof runtimeDepsJson === 'object' && !Array.isArray(runtimeDepsJson)
      ? ({ ...(runtimeDepsJson as Record<string, unknown>) } as Record<string, unknown>)
      : {};
  if (!Array.isArray(rd.runtimeDependencies)) {
    rd.runtimeDependencies = [];
  }
  return rd;
}

/** Python DAG 生成仍使用聚合后的 AirflowOptions（调度 + 报警规则列表） */
export function buildAirflowOptionsForDag(scheduleJson: unknown, alertJson: unknown): AirflowOptions {
  const s =
    scheduleJson && typeof scheduleJson === 'object' && !Array.isArray(scheduleJson)
      ? (scheduleJson as Record<string, unknown>)
      : {};
  const a =
    alertJson && typeof alertJson === 'object' && !Array.isArray(alertJson)
      ? (alertJson as Record<string, unknown>)
      : {};
  const rules = Array.isArray(a.rules)
    ? a.rules
    : Array.isArray(a.alertRules)
      ? a.alertRules
      : [];
  return {
    owner: typeof s.owner === 'string' ? s.owner : 'etl',
    retries: typeof s.retries === 'number' ? s.retries : 1,
    retryDelayMinutes: typeof s.retryDelayMinutes === 'number' ? s.retryDelayMinutes : 5,
    emailOnFailure: s.emailOnFailure === true,
    cronExpression: typeof s.cronExpression === 'string' ? s.cronExpression : '',
    scheduleStartDate:
      typeof s.scheduleStartDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s.scheduleStartDate.trim())
        ? s.scheduleStartDate.trim()
        : '',
    alertRules: rules,
  };
}
