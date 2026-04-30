import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { pool } from '../config/postgres.js';

const CUBE_HOME = process.env.CUBE_HOME || '';

function deleteYmlFiles(versionId: number) {
  const cubesFile = path.join(CUBE_HOME, 'cubes', `${versionId}.yml`);
  const viewsFile = path.join(CUBE_HOME, 'views', `${versionId}.yml`);
  try { fs.unlinkSync(cubesFile); } catch { /* ignore if not exists */ }
  try { fs.unlinkSync(viewsFile); } catch { /* ignore if not exists */ }
}

const router: Router = Router();

/**
 * List all cubes (distinct names with aggregated info)
 * GET /api/cube
 */
router.get('/', async (_req: Request, res: Response): Promise<void> => {
  try {
    const result = await pool.query(
      `SELECT name,
              COUNT(*) AS version_count,
              MAX(created_at) AS updated_at,
              (SELECT created_at FROM cube_versions cv2 WHERE cv2.name = cv1.name AND cv2.is_published = true LIMIT 1) AS published_at
       FROM cube_versions cv1
       GROUP BY name
       ORDER BY MAX(created_at) DESC`
    );
    res.json({ cubes: result.rows });
  } catch (error) {
    console.error('Error listing cubes:', error);
    res.status(500).json({ error: 'Failed to list cubes' });
  }
});

/**
 * Create a new cube (inserts an initial version)
 * POST /api/cube
 * Body: { name }
 */
router.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const { name } = req.body;
    if (!name || typeof name !== 'string') {
      res.status(400).json({ error: 'name is required' });
      return;
    }

    // Check if cube name already exists
    const existing = await pool.query(
      'SELECT 1 FROM cube_versions WHERE name = $1 LIMIT 1',
      [name]
    );
    if (existing.rows.length > 0) {
      res.status(409).json({ error: 'Cube name already exists' });
      return;
    }

    // Insert an initial version
    const result = await pool.query(
      `INSERT INTO cube_versions (name, remark, canvas_data, field_list, model_json, model_yml, model_view)
       VALUES ($1, '初始版本', '{}', '[]', '[]', '', '')
       RETURNING id, name, remark, is_published, canvas_data, field_list, model_json, model_yml, model_view, created_at, updated_at`,
      [name]
    );

    res.status(201).json({ cube: { name, version: result.rows[0] } });
  } catch (error) {
    console.error('Error creating cube:', error);
    res.status(500).json({ error: 'Failed to create cube' });
  }
});

/**
 * Delete a cube (all versions with the given name)
 * DELETE /api/cube/:name
 */
router.delete('/:name', async (req: Request, res: Response): Promise<void> => {
  try {
    const { name } = req.params;

    // Find published version ids before deleting (to clean up yml files)
    const publishedResult = await pool.query(
      'SELECT id FROM cube_versions WHERE name = $1 AND is_published = true',
      [name]
    );

    const result = await pool.query(
      'DELETE FROM cube_versions WHERE name = $1 RETURNING id',
      [name]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Cube not found' });
      return;
    }

    // Delete yml files for published versions
    if (CUBE_HOME) {
      for (const row of publishedResult.rows) {
        deleteYmlFiles(row.id);
      }
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting cube:', error);
    res.status(500).json({ error: 'Failed to delete cube' });
  }
});

/**
 * List all versions for a cube, ordered by created_at DESC
 * GET /api/cube/versions?name=xxx
 */
router.get('/versions', async (req: Request, res: Response): Promise<void> => {
  try {
    const { name } = req.query;
    if (!name || typeof name !== 'string') {
      res.status(400).json({ error: 'name query parameter is required' });
      return;
    }

    const result = await pool.query(
      `SELECT id, name, remark, is_published, canvas_data, field_list, model_json, model_yml, model_view, created_at, updated_at
       FROM cube_versions
       WHERE name = $1
       ORDER BY created_at DESC`,
      [name]
    );

    res.json({ versions: result.rows });
  } catch (error) {
    console.error('Error listing cube versions:', error);
    res.status(500).json({ error: 'Failed to list cube versions' });
  }
});

/**
 * Get a specific version by id
 * GET /api/cube/versions/:id
 */
router.get('/versions/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `SELECT id, name, remark, is_published, canvas_data, field_list, model_json, model_yml, model_view, created_at, updated_at
       FROM cube_versions
       WHERE id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Version not found' });
      return;
    }

    res.json({ version: result.rows[0] });
  } catch (error) {
    console.error('Error getting cube version:', error);
    res.status(500).json({ error: 'Failed to get cube version' });
  }
});

/**
 * Save a new version
 * POST /api/cube/versions
 * Body: { name, remark?, canvasData, fieldList, yamlContent }
 */
router.post('/versions', async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, remark, canvasData, fieldList, modelJson, modelYml, modelView } = req.body;

    if (!name) {
      res.status(400).json({ error: 'name is required' });
      return;
    }

    // Generate default remark if not provided
    const tableCount = canvasData?.nodes?.length ?? 0;
    const columnCount = fieldList?.length ?? 0;
    const finalRemark = remark || `table_${tableCount}_column_${columnCount}`;

    const result = await pool.query(
      `INSERT INTO cube_versions (name, remark, canvas_data, field_list, model_json, model_yml, model_view)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, name, remark, is_published, canvas_data, field_list, model_json, model_yml, model_view, created_at, updated_at`,
      [name, finalRemark, JSON.stringify(canvasData || {}), JSON.stringify(fieldList || []), modelJson || '[]', modelYml || '', modelView || '']
    );

    res.status(201).json({ version: result.rows[0] });
  } catch (error) {
    console.error('Error saving cube version:', error);
    res.status(500).json({ error: 'Failed to save cube version' });
  }
});

/**
 * Publish a version (unpublish any other published version for the same cube name)
 * PUT /api/cube/versions/:id/publish
 */
router.put('/versions/:id/publish', async (req: Request, res: Response): Promise<void> => {
  const client = await pool.connect();
  try {
    const { id } = req.params;

    await client.query('BEGIN');

    // Get the version to publish
    const versionResult = await client.query(
      'SELECT name, model_yml, model_view FROM cube_versions WHERE id = $1',
      [id]
    );

    if (versionResult.rows.length === 0) {
      await client.query('ROLLBACK');
      res.status(404).json({ error: 'Version not found' });
      return;
    }

    const cubeName = versionResult.rows[0].name;
    const modelYml = versionResult.rows[0].model_yml;
    const modelView = versionResult.rows[0].model_view;

    // Find currently published version to delete its yml files
    const oldPublished = await client.query(
      'SELECT id FROM cube_versions WHERE name = $1 AND is_published = true',
      [cubeName]
    );

    // Unpublish any currently published version for this cube
    await client.query(
      'UPDATE cube_versions SET is_published = false WHERE name = $1 AND is_published = true',
      [cubeName]
    );

    // Publish the selected version
    const result = await client.query(
      `UPDATE cube_versions SET is_published = true WHERE id = $1
       RETURNING id, name, remark, is_published, canvas_data, field_list, model_json, model_yml, model_view, created_at, updated_at`,
      [id]
    );

    // Delete old published version's yml files, then write new ones
    if (CUBE_HOME) {
      try {
        for (const row of oldPublished.rows) {
          deleteYmlFiles(row.id);
        }

        const cubesDir = path.join(CUBE_HOME, 'cubes');
        const viewsDir = path.join(CUBE_HOME, 'views');
        fs.mkdirSync(cubesDir, { recursive: true });
        fs.mkdirSync(viewsDir, { recursive: true });

        const versionId = parseInt(id);
        if (modelYml) {
          fs.writeFileSync(path.join(cubesDir, `${versionId}.yml`), modelYml, 'utf8');
        }
        if (modelView) {
          fs.writeFileSync(path.join(viewsDir, `${versionId}.yml`), modelView, 'utf8');
        }
        console.log(`Cube published: wrote ${versionId}.yml to CUBE_HOME`);
      } catch (fileError) {
        console.error('Error writing yml files to CUBE_HOME:', fileError);
      }
    }

    await client.query('COMMIT');
    res.json({ version: result.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error publishing cube version:', error);
    res.status(500).json({ error: 'Failed to publish cube version' });
  } finally {
    client.release();
  }
});

/**
 * Delete a version
 * DELETE /api/cube/versions/:id
 */
router.delete('/versions/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    // Check if this version is published (to clean up yml files)
    const checkResult = await pool.query(
      'SELECT is_published FROM cube_versions WHERE id = $1',
      [id]
    );

    const result = await pool.query(
      'DELETE FROM cube_versions WHERE id = $1 RETURNING id',
      [id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Version not found' });
      return;
    }

    // Delete yml files if the version was published
    if (CUBE_HOME && checkResult.rows.length > 0 && checkResult.rows[0].is_published) {
      deleteYmlFiles(parseInt(id));
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting cube version:', error);
    res.status(500).json({ error: 'Failed to delete cube version' });
  }
});

export default router;
