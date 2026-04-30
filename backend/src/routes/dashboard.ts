import { Router, Request, Response } from 'express';
import { pool } from '../config/postgres.js';

const router: Router = Router();

// ─── Folder APIs ───

/**
 * List all folders as a tree
 * GET /api/dashboard/folders
 */
router.get('/folders', async (_req: Request, res: Response): Promise<void> => {
  try {
    const result = await pool.query(
      'SELECT id, name, parent_id, sort_order, created_at, updated_at FROM dashboard_folders ORDER BY sort_order, name'
    );
    res.json({ folders: result.rows });
  } catch (error) {
    console.error('Error listing folders:', error);
    res.status(500).json({ error: 'Failed to list folders' });
  }
});

/**
 * Create a folder
 * POST /api/dashboard/folders
 */
router.post('/folders', async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, parentId, sortOrder } = req.body;
    if (!name) {
      res.status(400).json({ error: 'name is required' });
      return;
    }

    const result = await pool.query(
      `INSERT INTO dashboard_folders (name, parent_id, sort_order)
       VALUES ($1, $2, $3)
       RETURNING id, name, parent_id, sort_order, created_at, updated_at`,
      [name, parentId || null, sortOrder || 0]
    );

    res.status(201).json({ folder: result.rows[0] });
  } catch (error) {
    console.error('Error creating folder:', error);
    res.status(500).json({ error: 'Failed to create folder' });
  }
});

/**
 * Update a folder
 * PUT /api/dashboard/folders/:id
 */
router.put('/folders/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { name, parentId, sortOrder } = req.body;

    const existing = await pool.query('SELECT id FROM dashboard_folders WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      res.status(404).json({ error: 'Folder not found' });
      return;
    }

    const result = await pool.query(
      `UPDATE dashboard_folders SET
        name = COALESCE($1, name),
        parent_id = COALESCE($2, parent_id),
        sort_order = COALESCE($3, sort_order)
       WHERE id = $4
       RETURNING id, name, parent_id, sort_order, created_at, updated_at`,
      [name || null, parentId !== undefined ? parentId : null, sortOrder !== undefined ? sortOrder : null, id]
    );

    res.json({ folder: result.rows[0] });
  } catch (error) {
    console.error('Error updating folder:', error);
    res.status(500).json({ error: 'Failed to update folder' });
  }
});

/**
 * Delete a folder
 * DELETE /api/dashboard/folders/:id
 */
router.delete('/folders/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM dashboard_folders WHERE id = $1 RETURNING id', [id]);

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Folder not found' });
      return;
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting folder:', error);
    res.status(500).json({ error: 'Failed to delete folder' });
  }
});

// ─── Dashboard APIs ───

/**
 * List dashboards (optionally filter by folderId)
 * GET /api/dashboard?folderId=xxx
 */
router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const { folderId } = req.query;
    let query = `
      SELECT d.id, d.name, d.folder_id, d.filters, d.layout, d.created_at, d.updated_at,
             COALESCE(dc.chart_count, 0) AS chart_count
      FROM dashboards d
      LEFT JOIN (SELECT dashboard_id, COUNT(*) AS chart_count FROM dashboard_charts GROUP BY dashboard_id) dc
        ON d.id = dc.dashboard_id
    `;
    const params: any[] = [];

    if (folderId) {
      query += ' WHERE d.folder_id = $1';
      params.push(folderId);
    } else if (folderId === 'null' || folderId === '') {
      query += ' WHERE d.folder_id IS NULL';
    }

    query += ' ORDER BY d.updated_at DESC';

    const result = await pool.query(query, params);
    res.json({ dashboards: result.rows });
  } catch (error) {
    console.error('Error listing dashboards:', error);
    res.status(500).json({ error: 'Failed to list dashboards' });
  }
});

/**
 * Create a dashboard
 * POST /api/dashboard
 */
router.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, folderId, filters, layout } = req.body;
    if (!name) {
      res.status(400).json({ error: 'name is required' });
      return;
    }

    const result = await pool.query(
      `INSERT INTO dashboards (name, folder_id, filters, layout)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [name, folderId || null, JSON.stringify(filters || []), JSON.stringify(layout || [])]
    );

    res.status(201).json({ dashboard: result.rows[0] });
  } catch (error) {
    console.error('Error creating dashboard:', error);
    res.status(500).json({ error: 'Failed to create dashboard' });
  }
});

/**
 * Get a dashboard by id (with charts)
 * GET /api/dashboard/:id
 */
router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const dashResult = await pool.query('SELECT * FROM dashboards WHERE id = $1', [id]);
    if (dashResult.rows.length === 0) {
      res.status(404).json({ error: 'Dashboard not found' });
      return;
    }

    const chartsResult = await pool.query(
      `SELECT c.*, dc.position
       FROM dashboard_charts dc
       JOIN charts c ON c.id = dc.chart_id
       WHERE dc.dashboard_id = $1
       ORDER BY dc.id`,
      [id]
    );

    res.json({
      dashboard: dashResult.rows[0],
      charts: chartsResult.rows,
    });
  } catch (error) {
    console.error('Error getting dashboard:', error);
    res.status(500).json({ error: 'Failed to get dashboard' });
  }
});

/**
 * Update a dashboard
 * PUT /api/dashboard/:id
 */
router.put('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { name, folderId, filters, layout } = req.body;

    const existing = await pool.query('SELECT id FROM dashboards WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      res.status(404).json({ error: 'Dashboard not found' });
      return;
    }

    const result = await pool.query(
      `UPDATE dashboards SET
        name = COALESCE($1, name),
        folder_id = COALESCE($2, folder_id),
        filters = COALESCE($3, filters),
        layout = COALESCE($4, layout)
       WHERE id = $5
       RETURNING *`,
      [
        name || null,
        folderId !== undefined ? folderId : null,
        filters !== undefined ? JSON.stringify(filters) : null,
        layout !== undefined ? JSON.stringify(layout) : null,
        id,
      ]
    );

    res.json({ dashboard: result.rows[0] });
  } catch (error) {
    console.error('Error updating dashboard:', error);
    res.status(500).json({ error: 'Failed to update dashboard' });
  }
});

/**
 * Delete a dashboard
 * DELETE /api/dashboard/:id
 */
router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM dashboards WHERE id = $1 RETURNING id', [id]);

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Dashboard not found' });
      return;
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting dashboard:', error);
    res.status(500).json({ error: 'Failed to delete dashboard' });
  }
});

// ─── Dashboard-Chart Association APIs ───

/**
 * Add a chart to a dashboard
 * POST /api/dashboard/:id/charts
 */
router.post('/:id/charts', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { chartId, position } = req.body;

    if (!chartId) {
      res.status(400).json({ error: 'chartId is required' });
      return;
    }

    // Verify dashboard exists
    const dashCheck = await pool.query('SELECT id FROM dashboards WHERE id = $1', [id]);
    if (dashCheck.rows.length === 0) {
      res.status(404).json({ error: 'Dashboard not found' });
      return;
    }

    // Verify chart exists
    const chartCheck = await pool.query('SELECT id FROM charts WHERE id = $1', [chartId]);
    if (chartCheck.rows.length === 0) {
      res.status(404).json({ error: 'Chart not found' });
      return;
    }

    const result = await pool.query(
      `INSERT INTO dashboard_charts (dashboard_id, chart_id, position)
       VALUES ($1, $2, $3)
       ON CONFLICT (dashboard_id, chart_id) DO NOTHING
       RETURNING *`,
      [id, chartId, position ? JSON.stringify(position) : null]
    );

    if (result.rows.length === 0) {
      res.status(409).json({ error: 'Chart already exists in this dashboard' });
      return;
    }

    res.status(201).json({ dashboardChart: result.rows[0] });
  } catch (error) {
    console.error('Error adding chart to dashboard:', error);
    res.status(500).json({ error: 'Failed to add chart to dashboard' });
  }
});

/**
 * Remove a chart from a dashboard
 * DELETE /api/dashboard/:id/charts/:chartId
 */
router.delete('/:id/charts/:chartId', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id, chartId } = req.params;

    const result = await pool.query(
      'DELETE FROM dashboard_charts WHERE dashboard_id = $1 AND chart_id = $2 RETURNING id',
      [id, chartId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Chart not found in this dashboard' });
      return;
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error removing chart from dashboard:', error);
    res.status(500).json({ error: 'Failed to remove chart from dashboard' });
  }
});

export default router;
