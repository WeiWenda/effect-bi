export interface AirflowOptions {
  owner?: string;
  retries?: number;
  retryDelayMinutes?: number;
  emailOnFailure?: boolean;
}

export type QualityRule =
  | { kind: 'min_row_count'; value: number }
  | { kind: 'sql_check'; sql: string }
  | { kind: 'custom'; label: string; payload?: Record<string, unknown> };
