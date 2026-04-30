import axios, { AxiosResponse } from 'axios';

const CHART_API_BASE_URL = 'http://127.0.0.1:3001/api/chart';

import type { ChartConfig } from '../types/chart';

export interface ChartResponse {
  chart: ChartConfig & {
    id: number;
    view_name: string;
    chart_type: string;
    created_at: string;
    updated_at: string;
  };
}

function toChartConfig(row: any): ChartConfig {
  return {
    id: row.id,
    name: row.name,
    viewName: row.view_name,
    chartType: row.chart_type,
    dimensions: typeof row.dimensions === 'string' ? JSON.parse(row.dimensions) : row.dimensions || [],
    metrics: typeof row.metrics === 'string' ? JSON.parse(row.metrics) : row.metrics || [],
    filters: typeof row.filters === 'string' ? JSON.parse(row.filters) : row.filters || [],
    sort: typeof row.sort === 'string' ? JSON.parse(row.sort) : row.sort || [],
    limit: row.limit || 500,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toApiBody(config: Partial<ChartConfig>) {
  return {
    name: config.name,
    viewName: config.viewName,
    chartType: config.chartType,
    dimensions: config.dimensions || [],
    metrics: config.metrics || [],
    filters: config.filters || [],
    sort: config.sort || [],
    limit: config.limit,
  };
}

export const chartAPI = {
  create: async (config: ChartConfig): Promise<ChartConfig> => {
    const response: AxiosResponse<ChartResponse> = await axios.post(CHART_API_BASE_URL, toApiBody(config));
    return toChartConfig(response.data.chart);
  },

  get: async (id: number): Promise<ChartConfig> => {
    const response: AxiosResponse<ChartResponse> = await axios.get(`${CHART_API_BASE_URL}/${id}`);
    return toChartConfig(response.data.chart);
  },

  update: async (id: number, config: Partial<ChartConfig>): Promise<ChartConfig> => {
    const response: AxiosResponse<ChartResponse> = await axios.put(`${CHART_API_BASE_URL}/${id}`, toApiBody(config));
    return toChartConfig(response.data.chart);
  },

  delete: async (id: number): Promise<void> => {
    await axios.delete(`${CHART_API_BASE_URL}/${id}`);
  },
};
