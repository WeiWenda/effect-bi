import axios, { AxiosResponse } from 'axios';

const CUBE_PROXY_BASE_URL = '/api/cube-proxy';

import type { CubeLoadResponse, CubeQuery, CubeSqlResponse } from '../types/chart';

export const cubeProxyAPI = {
  /**
   * Get cubes/views metadata (dimensions, measures, etc.)
   * GET /api/cube-proxy/v1/meta
   */
  meta: async (): Promise<CubeLoadResponse> => {
    const response: AxiosResponse<CubeLoadResponse> = await axios.get(`${CUBE_PROXY_BASE_URL}/v1/meta`);
    return response.data;
  },

  /**
   * Execute a query and get data results
   * POST /api/cube-proxy/v1/load
   * Body: { query: CubeQuery }
   * Returns: { query, data, annotation, lastRefreshTime }
   */
  load: async (query: CubeQuery): Promise<{ data: any[]; annotation: any; lastRefreshTime: string }> => {
    const response: AxiosResponse<any> = await axios.post(`${CUBE_PROXY_BASE_URL}/v1/load`, {
      query,
    });
    return response.data;
  },

  /**
   * Get generated SQL for a query (debug)
   * POST /api/cube-proxy/v1/sql
   */
  sql: async (query: CubeQuery): Promise<CubeSqlResponse> => {
    const response: AxiosResponse<CubeSqlResponse> = await axios.post(`${CUBE_PROXY_BASE_URL}/v1/sql`, {
      query,
    });
    return response.data;
  },
};
