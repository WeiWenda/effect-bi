import axios, { AxiosResponse } from 'axios';

const DASHBOARD_API_BASE_URL = '/api/dashboard';

import type { DashboardFolder, DashboardInfo, FilterConfig, DashboardLayoutItem, ChartConfig } from '../types/chart';
import { normalizeDrilldownConfigForClient } from '../utils/drilldownConfig';

// ─── Folder APIs ───

export const folderAPI = {
  list: async (): Promise<DashboardFolder[]> => {
    const response: AxiosResponse<{ folders: DashboardFolder[] }> = await axios.get(`${DASHBOARD_API_BASE_URL}/folders`);
    return response.data.folders;
  },

  create: async (name: string, parentId?: number): Promise<DashboardFolder> => {
    const response: AxiosResponse<{ folder: DashboardFolder }> = await axios.post(`${DASHBOARD_API_BASE_URL}/folders`, {
      name,
      parentId: parentId || null,
    });
    return response.data.folder;
  },

  update: async (id: number, data: { name?: string; parentId?: number | null; sortOrder?: number }): Promise<DashboardFolder> => {
    const response: AxiosResponse<{ folder: DashboardFolder }> = await axios.put(`${DASHBOARD_API_BASE_URL}/folders/${id}`, data);
    return response.data.folder;
  },

  delete: async (id: number): Promise<void> => {
    await axios.delete(`${DASHBOARD_API_BASE_URL}/folders/${id}`);
  },
};

// ─── Dashboard APIs ───

interface DashboardRow {
  id: number;
  name: string;
  folder_id: number | null;
  sort_order?: number;
  filters: any;
  layout: any;
  chart_count?: number;
  created_at: string;
  updated_at: string;
}

function toDashboardInfo(row: DashboardRow): DashboardInfo {
  return {
    id: row.id,
    name: row.name,
    folder_id: row.folder_id,
    sort_order: typeof row.sort_order === 'number' ? row.sort_order : 0,
    filters: typeof row.filters === 'string' ? JSON.parse(row.filters) : row.filters || [],
    layout: typeof row.layout === 'string' ? JSON.parse(row.layout) : row.layout || [],
    chart_count: row.chart_count || 0,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export interface DashboardDetail {
  dashboard: DashboardInfo;
  charts: ChartConfig[];
}

export const dashboardAPI = {
  list: async (folderId?: number | null): Promise<DashboardInfo[]> => {
    const params: Record<string, string> = {};
    if (folderId !== undefined && folderId !== null) {
      params.folderId = String(folderId);
    }
    const response: AxiosResponse<{ dashboards: DashboardRow[] }> = await axios.get(DASHBOARD_API_BASE_URL, { params });
    return response.data.dashboards.map(toDashboardInfo);
  },

  create: async (
    name: string,
    folderId?: number | null,
    extra?: { layout?: DashboardLayoutItem[] }
  ): Promise<DashboardInfo> => {
    const response: AxiosResponse<{ dashboard: DashboardRow }> = await axios.post(DASHBOARD_API_BASE_URL, {
      name,
      folderId: folderId || null,
      ...(extra?.layout !== undefined ? { layout: extra.layout } : {}),
    });
    return toDashboardInfo(response.data.dashboard);
  },

  get: async (id: number): Promise<DashboardDetail> => {
    const response: AxiosResponse<{ dashboard: DashboardRow; charts: any[] }> = await axios.get(`${DASHBOARD_API_BASE_URL}/${id}`);
    const dashInfo = toDashboardInfo(response.data.dashboard);
    const charts: ChartConfig[] = response.data.charts.map((c: any) => ({
      id: c.id,
      name: c.name,
      cubeName: c.cube_name,
      viewName: c.view_name,
      chartType: c.chart_type,
      dimensions: typeof c.dimensions === 'string' ? JSON.parse(c.dimensions) : c.dimensions || [],
      metrics: typeof c.metrics === 'string' ? JSON.parse(c.metrics) : c.metrics || [],
      filters: typeof c.filters === 'string' ? JSON.parse(c.filters) : c.filters || [],
      dynamicFilters: typeof c.dynamic_filters === 'string' ? JSON.parse(c.dynamic_filters) : c.dynamic_filters || [],
      drilldownConfig: normalizeDrilldownConfigForClient(
        typeof c.drilldown_config === 'string' ? JSON.parse(c.drilldown_config) : c.drilldown_config
      ),
      rtfTextConfig:
        c.rtf_text_config == null
          ? undefined
          : typeof c.rtf_text_config === 'string'
            ? JSON.parse(c.rtf_text_config)
            : c.rtf_text_config,
      sort: typeof c.sort === 'string' ? JSON.parse(c.sort) : c.sort || [],
      limit: c.limit || 500,
      createdAt: c.created_at,
      updatedAt: c.updated_at,
    }));
    return { dashboard: dashInfo, charts };
  },

  update: async (
    id: number,
    data: {
      name?: string;
      folderId?: number | null;
      filters?: FilterConfig[];
      layout?: DashboardLayoutItem[];
      sortOrder?: number;
    }
  ): Promise<DashboardInfo> => {
    const response: AxiosResponse<{ dashboard: DashboardRow }> = await axios.put(`${DASHBOARD_API_BASE_URL}/${id}`, data);
    return toDashboardInfo(response.data.dashboard);
  },

  delete: async (id: number): Promise<void> => {
    await axios.delete(`${DASHBOARD_API_BASE_URL}/${id}`);
  },

  addChart: async (dashboardId: number, chartId: number, position?: any): Promise<void> => {
    await axios.post(`${DASHBOARD_API_BASE_URL}/${dashboardId}/charts`, { chartId, position });
  },

  removeChart: async (dashboardId: number, chartId: number): Promise<void> => {
    await axios.delete(`${DASHBOARD_API_BASE_URL}/${dashboardId}/charts/${chartId}`);
  },
};
