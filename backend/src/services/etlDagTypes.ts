export interface AirflowOptions {
  owner?: string;
  retries?: number;
  retryDelayMinutes?: number;
  emailOnFailure?: boolean;
  /** Airflow / 调度侧使用的 crontab 字符串 */
  cronExpression?: string;
  /** DAG `start_date` 日历日，ISO `YYYY-MM-DD`（按 UTC 日解释） */
  scheduleStartDate?: string;
  /** 任务报警规则列表 */
  alertRules?: unknown[];
}

/** Payload for in-process DAG Python generation. */
export interface DagGeneratePayload {
  /** `etl_task_info.id` — Airflow `dag_id` = `auto_generate_{etlTaskInfoId}` */
  etlTaskInfoId: number;
  versionId: number;
  logicalName: string;
  sqlMain: string;
  airflowOptions: AirflowOptions;
  /** Embedded as QUALITY_RULES_JSON */
  qualityRules: unknown;
  /** 与 DB runtime_deps_json 一致，供 Python DAG 生成依赖轮询 */
  runtimeDepsJson?: unknown;
}

export type QualityRule =
  | { kind: 'min_row_count'; value: number }
  | { kind: 'sql_check'; sql: string }
  | { kind: 'custom'; label: string; payload?: Record<string, unknown> };
