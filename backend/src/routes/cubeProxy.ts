import { Router, Request, Response } from 'express';
import axios, { AxiosResponse } from 'axios';

const router: Router = Router();

const CUBE_SERVER_URL = process.env.CUBE_SERVER_URL || 'http://localhost:4000';
const CUBE_API_TOKEN = process.env.CUBE_API_TOKEN || '';

function getHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (CUBE_API_TOKEN) {
    headers['Authorization'] = `Bearer ${CUBE_API_TOKEN}`;
  }
  return headers;
}

/**
 * Proxy: Get cubes/views metadata
 * GET /api/cube-proxy/v1/meta
 * Returns: { cubes: [{ name, title, measures, dimensions, ... }] }
 */
router.get('/v1/meta', async (_req: Request, res: Response): Promise<void> => {
  try {
    const response: AxiosResponse = await axios.get(
      `${CUBE_SERVER_URL}/cubejs-api/v1/meta`,
      { headers: getHeaders(), timeout: 15000 }
    );
    res.json(response.data);
  } catch (error: any) {
    console.error('Error proxying cube meta:', error?.message || error);
    const status = error?.response?.status || 500;
    res.status(status).json({ error: 'Failed to get cube metadata', detail: error?.response?.data || error?.message });
  }
});

/**
 * Proxy: Execute a query and get results
 * POST /api/cube-proxy/v1/load
 * Body: { query: CubeQuery }
 * Returns: { query, data, annotation, lastRefreshTime }
 */
router.post('/v1/load', async (req: Request, res: Response): Promise<void> => {
  try {
    const response: AxiosResponse = await axios.post(
      `${CUBE_SERVER_URL}/cubejs-api/v1/load`,
      req.body,
      { headers: getHeaders() }
    );
    res.json(response.data);
  } catch (error: any) {
    console.error('Error proxying cube load:', error?.response?.data || error.message);
    const status = error?.response?.status || 500;
    res.status(status).json({ error: 'Failed to execute cube query', detail: error?.response?.data });
  }
});

/**
 * Proxy: Get generated SQL for a query (debug)
 * POST /api/cube-proxy/v1/sql
 * Body: { query: CubeQuery }
 * Returns: { sql: [sqlString, params], status: "ok" }
 */
router.post('/v1/sql', async (req: Request, res: Response): Promise<void> => {
  try {
    const response: AxiosResponse = await axios.post(
      `${CUBE_SERVER_URL}/cubejs-api/v1/sql`,
      req.body,
      { headers: getHeaders() }
    );
    res.json(response.data);
  } catch (error: any) {
    console.error('Error proxying cube sql:', error?.response?.data || error.message);
    const status = error?.response?.status || 500;
    res.status(status).json({ error: 'Failed to get cube SQL', detail: error?.response?.data });
  }
});

export default router;
