import axios, { AxiosResponse, isAxiosError } from 'axios';

const ETL_API_BASE_URL = 'http://127.0.0.1:3001/api/etl';

export interface AdhocSession {
  id: number;
  title: string;
  draftSql: string;
  defaultContext: unknown;
  createdAt: string;
  updatedAt: string;
}

export interface AdhocSubmission {
  id: number;
  sessionId: number;
  sqlText: string;
  status: string;
  errorMessage: string | null;
  submittedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  rowsReturned: number | null;
  resultSchemaJson?: unknown;
  resultPreviewJson?: unknown;
}

export interface EtlTaskOutput {
  catalogName: string;
  databaseName: string;
  tableName: string;
}

/** etl_table_partition_detail 行（血缘表详情「产出信息」） */
export interface EtlTablePartitionDetailRow {
  id: number;
  catalogName: string;
  databaseName: string;
  tableName: string;
  primaryPartitionKey: string;
  secondaryPartitionKey: string;
  etlTaskVersionId: number | null;
  partitionDate: string;
  isVerified: boolean;
  runningStatus: string;
  lastSuccessAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface EtlTaskVersion {
  id: number;
  name: string;
  remark: string;
  isPublished: boolean;
  sqlMain: string;
  /** 调度：crontab、调度开始日 scheduleStartDate、重试、owner 等 */
  scheduleJson: Record<string, unknown>;
  /** 任务报警：{ rules: [...] } */
  alertJson: Record<string, unknown>;
  /** 运行依赖：{ runtimeDependencies: [...] } */
  runtimeDepsJson: Record<string, unknown>;
  /** 产出表（存 etl_task_info） */
  taskOutput: EtlTaskOutput;
  qualityRulesJson: unknown;
  createdAt: string;
  updatedAt: string;
}

export interface EtlFolder {
  id: number;
  name: string;
  parent_id: number | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface EtlTaskListRow {
  name: string;
  version_count: number;
  updated_at: string;
  /** 当前标记为已发布的版本 id（每任务至多一条） */
  published_version_id: number | null;
  /** 按 updated_at、id 计的最新版本 id，用于与 published 比较 */
  latest_version_id: number | null;
  folder_id: number | null;
  folder_sort_order: number;
}

export interface EtlAirflowDeployment {
  id: number;
  etlTaskVersionId: number;
  airflowDagId: string;
  logicalTaskName: string;
  generator: string;
  createdAt: string;
}

/** PUT .../publish 成功响应：是否已通过 REST 取消暂停 DAG（开启调度） */
export type EtlPublishAirflowUnpause = { skipped: true } | { ok: true };

/** 发布后按调度开始日～当前时间发起的 Backfill（Airflow 3 /api/v2）；maxActiveRuns 为后端写入请求的并行 DAG Run 上限 */
export type EtlPublishAirflowBackfill =
  | { skipped: true; reason: string; maxActiveRuns: number }
  | { ok: true; backfillId: number; maxActiveRuns: number }
  | { ok: false; error: string; maxActiveRuns: number };

export const etlFolderAPI = {
  list: async (): Promise<EtlFolder[]> => {
    const response: AxiosResponse<{ folders: EtlFolder[] }> = await axios.get(`${ETL_API_BASE_URL}/folders`);
    return response.data.folders;
  },

  create: async (name: string, parentId?: number | null, sortOrder?: number): Promise<EtlFolder> => {
    const response: AxiosResponse<{ folder: EtlFolder }> = await axios.post(`${ETL_API_BASE_URL}/folders`, {
      name,
      parentId: parentId ?? null,
      sortOrder: sortOrder ?? 0,
    });
    return response.data.folder;
  },

  update: async (
    id: number,
    data: { name?: string; parentId?: number | null; sortOrder?: number }
  ): Promise<EtlFolder> => {
    const response: AxiosResponse<{ folder: EtlFolder }> = await axios.put(`${ETL_API_BASE_URL}/folders/${id}`, data);
    return response.data.folder;
  },

  delete: async (id: number): Promise<void> => {
    await axios.delete(`${ETL_API_BASE_URL}/folders/${id}`);
  },
};

export const etlAPI = {
  createAdhocSession: async (title?: string): Promise<{ session: AdhocSession }> => {
    const response: AxiosResponse<{ session: AdhocSession }> = await axios.post(
      `${ETL_API_BASE_URL}/adhoc/sessions`,
      title ? { title } : {}
    );
    return response.data;
  },

  patchAdhocSession: async (id: number, body: { title?: string; draftSql?: string }): Promise<{ session: AdhocSession }> => {
    const response: AxiosResponse<{ session: AdhocSession }> = await axios.patch(
      `${ETL_API_BASE_URL}/adhoc/sessions/${id}`,
      body
    );
    return response.data;
  },

  getAdhocSession: async (
    id: number,
    limitSubmissions?: number
  ): Promise<{ session: AdhocSession; recentSubmissions: Omit<AdhocSubmission, 'resultSchemaJson' | 'resultPreviewJson'>[] }> => {
    const response = await axios.get(`${ETL_API_BASE_URL}/adhoc/sessions/${id}`, {
      params: limitSubmissions ? { limitSubmissions } : undefined,
    });
    return response.data;
  },

  submitAdhocSql: async (sessionId: number, sql: string): Promise<{ submission: AdhocSubmission }> => {
    const response: AxiosResponse<{ submission: AdhocSubmission }> = await axios.post(
      `${ETL_API_BASE_URL}/adhoc/sessions/${sessionId}/submit`,
      { sql }
    );
    return response.data;
  },

  getAdhocSubmission: async (id: number): Promise<{ submission: AdhocSubmission }> => {
    const response = await axios.get(`${ETL_API_BASE_URL}/adhoc/submissions/${id}`);
    return response.data;
  },

  getAdhocSubmissionResult: async (
    id: number,
    params?: { offset?: number; limit?: number }
  ): Promise<{
    columns: { name: string; type: string }[];
    rows: Record<string, unknown>[];
    total: number;
    offset: number;
    limit: number;
    status: string;
  }> => {
    const response = await axios.get(`${ETL_API_BASE_URL}/adhoc/submissions/${id}/result`, { params });
    return response.data;
  },

  deleteAdhocSubmission: async (id: number): Promise<{ success: boolean }> => {
    const response = await axios.delete(`${ETL_API_BASE_URL}/adhoc/submissions/${id}`);
    return response.data;
  },

  /** 按产出表三元组解析 ETL 逻辑任务名；未登记时返回 null */
  getTaskNameByOutputTable: async (
    catalog: string,
    database: string,
    table: string,
    opts?: { signal?: AbortSignal }
  ): Promise<{ name: string } | null> => {
    try {
      const response = await axios.get<{ name: string }>(`${ETL_API_BASE_URL}/task-name-by-output-table`, {
        params: { catalog, database, table },
        signal: opts?.signal,
      });
      return response.data;
    } catch (e) {
      if (isAxiosError(e) && e.response?.status === 404) return null;
      throw e;
    }
  },

  listTasks: async (): Promise<{ tasks: EtlTaskListRow[] }> => {
    const response = await axios.get(`${ETL_API_BASE_URL}/tasks`);
    return response.data;
  },

  deleteTask: async (name: string): Promise<{ success: boolean }> => {
    const response = await axios.delete(`${ETL_API_BASE_URL}/tasks`, { params: { name } });
    return response.data;
  },

  patchTaskPlacement: async (body: {
    name: string;
    folderId?: number | null;
    sortOrder?: number;
  }): Promise<{ success: boolean }> => {
    const response = await axios.patch(`${ETL_API_BASE_URL}/tasks/placement`, body);
    return response.data;
  },

  /** 产出表写入 etl_task_info，与版本无关；会先确保任务行存在 */
  patchTaskOutput: async (
    name: string,
    taskOutput: EtlTaskOutput
  ): Promise<{ taskOutput: EtlTaskOutput }> => {
    const response = await axios.patch(`${ETL_API_BASE_URL}/tasks/output`, { name, taskOutput });
    return response.data;
  },

  listTaskVersions: async (name: string): Promise<{ versions: EtlTaskVersion[] }> => {
    const response = await axios.get(`${ETL_API_BASE_URL}/tasks/versions`, { params: { name } });
    return response.data;
  },

  getTaskVersion: async (
    id: number,
    opts?: { signal?: AbortSignal }
  ): Promise<{ version: EtlTaskVersion }> => {
    const response = await axios.get(`${ETL_API_BASE_URL}/tasks/versions/${id}`, {
      signal: opts?.signal,
    });
    return response.data;
  },

  listTaskVersionDeployments: async (versionId: number): Promise<{ deployments: EtlAirflowDeployment[] }> => {
    const response = await axios.get(`${ETL_API_BASE_URL}/tasks/versions/${versionId}/deployments`);
    return response.data;
  },

  saveTaskVersion: async (body: {
    name: string;
    remark?: string;
    sqlMain: string;
    scheduleJson?: Record<string, unknown>;
    alertJson?: Record<string, unknown>;
    runtimeDepsJson?: Record<string, unknown>;
    qualityRulesJson?: unknown;
    /** 产出表请使用 patchTaskOutput，勿随版本保存 */
    taskOutput?: EtlTaskOutput;
    /** 省略则不在保存时改目录；传 null 表示未归类 */
    folderId?: number | null;
  }): Promise<{ version: EtlTaskVersion }> => {
    const response: AxiosResponse<{ version: EtlTaskVersion }> = await axios.post(
      `${ETL_API_BASE_URL}/tasks/versions`,
      body
    );
    return response.data;
  },

  publishTaskVersion: async (
    id: number
  ): Promise<{
    version: EtlTaskVersion;
    airflowUnpause: EtlPublishAirflowUnpause;
    airflowBackfill: EtlPublishAirflowBackfill;
  }> => {
    const response: AxiosResponse<{
      version: EtlTaskVersion;
      airflowUnpause: EtlPublishAirflowUnpause;
      airflowBackfill: EtlPublishAirflowBackfill;
    }> = await axios.put(`${ETL_API_BASE_URL}/tasks/versions/${id}/publish`, {});
    return response.data;
  },

  dryRunTaskSql: async (sql: string): Promise<{
    durationMs: number;
    columns: { name: string; type: string }[];
    rows: Record<string, unknown>[];
    rowCount: number;
  }> => {
    const response = await axios.post(`${ETL_API_BASE_URL}/tasks/dry-run`, { sql });
    return response.data;
  },

  dryRunTaskVersion: async (
    id: number,
    sql?: string
  ): Promise<{
    durationMs: number;
    columns: { name: string; type: string }[];
    rows: Record<string, unknown>[];
    rowCount: number;
  }> => {
    const response = await axios.post(`${ETL_API_BASE_URL}/tasks/versions/${id}/dry-run`, sql ? { sql } : {});
    return response.data;
  },

  deleteTaskVersion: async (id: number): Promise<{ success: boolean }> => {
    const response = await axios.delete(`${ETL_API_BASE_URL}/tasks/versions/${id}`);
    return response.data;
  },

  /** GET etl_table_partition_detail：按 catalog / database(schema) / table；分区日期倒序分页 */
  listTablePartitionDetails: async (params: {
    catalog: string;
    database: string;
    table: string;
    page?: number;
    pageSize?: number;
  }): Promise<{
    partitionDetails: EtlTablePartitionDetailRow[];
    total: number;
    page: number;
    pageSize: number;
  }> => {
    const response = await axios.get(`${ETL_API_BASE_URL}/table-partition-details`, {
      params: {
        catalog: params.catalog,
        database: params.database,
        table: params.table,
        page: params.page ?? 1,
        pageSize: params.pageSize ?? 20,
      },
    });
    return response.data;
  },
};
