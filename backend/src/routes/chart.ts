import { Router, Request, Response } from 'express';
import { pool } from '../config/postgres.js';

const router: Router = Router();

/**
 * Create a chart
 * POST /api/chart
 */
router.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, viewName, chartType, dimensions, metrics, filters, dynamicFilters, drilldownConfig, sort, limit } = req.body;

    if (!viewName) {
      res.status(400).json({ error: 'viewName is required' });
      return;
    }

    const result = await pool.query(
      `INSERT INTO charts (name, view_name, chart_type, dimensions, metrics, filters, dynamic_filters, drilldown_config, sort, "limit")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        name || '未命名图表',
        viewName,
        chartType || 'table',
        JSON.stringify(dimensions || []),
        JSON.stringify(metrics || []),
        JSON.stringify(filters || []),
        JSON.stringify(dynamicFilters || []),
        drilldownConfig ? JSON.stringify(drilldownConfig) : null,
        JSON.stringify(sort || []),
        limit || 500,
      ]
    );

    res.status(201).json({ chart: result.rows[0] });
  } catch (error) {
    console.error('Error creating chart:', error);
    res.status(500).json({ error: 'Failed to create chart' });
  }
});

/**
 * Get a chart by id
 * GET /api/chart/:id
 */
router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const result = await pool.query('SELECT * FROM charts WHERE id = $1', [id]);

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Chart not found' });
      return;
    }

    res.json({ chart: result.rows[0] });
  } catch (error) {
    console.error('Error getting chart:', error);
    res.status(500).json({ error: 'Failed to get chart' });
  }
});

/**
 * Update a chart
 * PUT /api/chart/:id
 */
router.put('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { name, viewName, chartType, dimensions, metrics, filters, dynamicFilters, drilldownConfig, sort, limit } = req.body;

    const existing = await pool.query('SELECT * FROM charts WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      res.status(404).json({ error: 'Chart not found' });
      return;
    }

    const result = await pool.query(
      `UPDATE charts SET
        name = COALESCE($1, name),
        view_name = COALESCE($2, view_name),
        chart_type = COALESCE($3, chart_type),
        dimensions = COALESCE($4, dimensions),
        metrics = COALESCE($5, metrics),
        filters = COALESCE($6, filters),
        dynamic_filters = COALESCE($7, dynamic_filters),
        drilldown_config = COALESCE($8, drilldown_config),
        sort = COALESCE($9, sort),
        "limit" = COALESCE($10, "limit")
       WHERE id = $11
       RETURNING *`,
      [
        name || null,
        viewName || null,
        chartType || null,
        dimensions !== undefined ? JSON.stringify(dimensions) : null,
        metrics !== undefined ? JSON.stringify(metrics) : null,
        filters !== undefined ? JSON.stringify(filters) : null,
        dynamicFilters !== undefined ? JSON.stringify(dynamicFilters) : null,
        drilldownConfig !== undefined ? (drilldownConfig ? JSON.stringify(drilldownConfig) : null) : null,
        sort !== undefined ? JSON.stringify(sort) : null,
        limit !== undefined ? limit : null,
        id,
      ]
    );

    res.json({ chart: result.rows[0] });
  } catch (error) {
    console.error('Error updating chart:', error);
    res.status(500).json({ error: 'Failed to update chart' });
  }
});

/**
 * Delete a chart
 * DELETE /api/chart/:id
 */
router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM charts WHERE id = $1 RETURNING id', [id]);

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Chart not found' });
      return;
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting chart:', error);
    res.status(500).json({ error: 'Failed to delete chart' });
  }
});

export default router;
