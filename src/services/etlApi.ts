import axios, { AxiosResponse } from 'axios';

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

export interface EtlTaskVersion {
  id: number;
  name: string;
  remark: string;
  isPublished: boolean;
  graphJson: unknown;
  sqlMain: string;
  airflowOptionsJson: Record<string, unknown>;
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
  published_version_id: number | null;
  folder_id: number | null;
  folder_sort_order: number;
}

export interface EtlAirflowDeployment {
  id: number;
  etlTaskVersionId: number;
  airflowDagId: string;
  logicalTaskName: string;
  dagFilePath: string | null;
  generator: string;
  createdAt: string;
}

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

  listTaskVersions: async (name: string): Promise<{ versions: EtlTaskVersion[] }> => {
    const response = await axios.get(`${ETL_API_BASE_URL}/tasks/versions`, { params: { name } });
    return response.data;
  },

  getTaskVersion: async (id: number): Promise<{ version: EtlTaskVersion }> => {
    const response = await axios.get(`${ETL_API_BASE_URL}/tasks/versions/${id}`);
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
    graphJson?: unknown;
    airflowOptionsJson?: Record<string, unknown>;
    qualityRulesJson?: unknown;
    /** 省略则不在保存时改目录；传 null 表示未归类 */
    folderId?: number | null;
  }): Promise<{ version: EtlTaskVersion }> => {
    const response: AxiosResponse<{ version: EtlTaskVersion }> = await axios.post(
      `${ETL_API_BASE_URL}/tasks/versions`,
      body
    );
    return response.data;
  },

  publishTaskVersion: async (id: number): Promise<{ version: EtlTaskVersion }> => {
    const response: AxiosResponse<{ version: EtlTaskVersion }> = await axios.put(
      `${ETL_API_BASE_URL}/tasks/versions/${id}/publish`,
      {}
    );
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
};
