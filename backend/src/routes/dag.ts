import { Router, Request, Response } from 'express';
import { pool } from '../config/postgres.js';

const router: Router = Router();

interface CreateDagRequest {
  name: string;
  nodeIds: string[];
  description?: string;
}

interface DagView {
  id: number;
  name: string;
  description: string | null;
  node_ids: string[];
  created_at: Date;
  updated_at: Date;
}

/**
 * Create a DAG view from selected node IDs
 * POST /api/dag
 */
router.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, nodeIds, description }: CreateDagRequest = req.body;

    if (!name || !nodeIds || !Array.isArray(nodeIds) || nodeIds.length === 0) {
      res.status(400).json({ error: 'Name and nodeIds array are required' });
      return;
    }

    const client = await pool.connect();
    try {
      const query = `
        INSERT INTO dag_views (name, description, node_ids)
        VALUES ($1, $2, $3)
        RETURNING id, name, description, node_ids, created_at, updated_at
      `;
      const result = await client.query(query, [name, description || null, JSON.stringify(nodeIds)]);
      
      const dagView: DagView = {
        id: result.rows[0].id,
        name: result.rows[0].name,
        description: result.rows[0].description,
        nodeIds: result.rows[0].node_ids,
        createdAt: result.rows[0].created_at,
        updatedAt: result.rows[0].updated_at,
      };

      res.status(201).json({ dagView });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error creating DAG view:', error);
    res.status(500).json({ error: 'Failed to create DAG view' });
  }
});

/**
 * Get all saved DAG views
 * GET /api/dag
 */
router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const client = await pool.connect();
    try {
      const query = `
        SELECT id, name, description, node_ids, created_at, updated_at
        FROM dag_views
        ORDER BY created_at DESC
      `;
      const result = await client.query(query);
      
      const dagViews: DagView[] = result.rows.map((row: any) => ({
        id: row.id,
        name: row.name,
        description: row.description,
        nodeIds: row.node_ids,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }));

      res.json({ dagViews });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error getting DAG views:', error);
    res.status(500).json({ error: 'Failed to get DAG views' });
  }
});

/**
 * Get DAG view details by ID
 * GET /api/dag/:id
 */
router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    if (!id || isNaN(parseInt(id))) {
      res.status(400).json({ error: 'Valid DAG view ID is required' });
      return;
    }

    const client = await pool.connect();
    try {
      const query = `
        SELECT id, name, description, node_ids, created_at, updated_at
        FROM dag_views
        WHERE id = $1
      `;
      const result = await client.query(query, [id]);

      if (result.rows.length === 0) {
        res.status(404).json({ error: 'DAG view not found' });
        return;
      }

      const dagView: DagView = {
        id: result.rows[0].id,
        name: result.rows[0].name,
        description: result.rows[0].description,
        nodeIds: result.rows[0].node_ids,
        createdAt: result.rows[0].created_at,
        updatedAt: result.rows[0].updated_at,
      };

      res.json({ dagView });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error getting DAG view:', error);
    res.status(500).json({ error: 'Failed to get DAG view' });
  }
});

/**
 * Delete a DAG view by ID
 * DELETE /api/dag/:id
 */
router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const idStr = Array.isArray(id) ? id[0] : id;

    if (!idStr || isNaN(parseInt(idStr))) {
      res.status(400).json({ error: 'Valid DAG view ID is required' });
      return;
    }

    const client = await pool.connect();
    try {
      const query = `
        DELETE FROM dag_views
        WHERE id = $1
        RETURNING id
      `;
      const result = await client.query(query, [idStr]);

      if (result.rows.length === 0) {
        res.status(404).json({ error: 'DAG view not found' });
        return;
      }

      res.json({ message: 'DAG view deleted successfully', id: result.rows[0].id });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error deleting DAG view:', error);
    res.status(500).json({ error: 'Failed to delete DAG view' });
  }
});

export default router;
