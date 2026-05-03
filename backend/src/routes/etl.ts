import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { pool } from '../config/postgres.js';
import { assertSingleSqlStatement, executeUserSql, trimRowsToPreview } from '../services/sqlQueryRunner.js';
import { generateDagPythonWithFallback } from '../services/etlDagPythonClient.js';
import type { AirflowOptions, QualityRule } from '../services/etlDagTypes.js';

const router: Router = Router();

function dagsDir(): string {
  if (process.env.ETL_AIRFLOW_DAGS_DIR) {
    return process.env.ETL_AIRFLOW_DAGS_DIR;
  }
  if (process.env.AIRFLOW_HOME) {
    return path.join(process.env.AIRFLOW_HOME, 'dags');
  }
  return '';
}

function safeDagFileBase(name: string, versionId: number): string {
  const safe = name.replace(/[^a-zA-Z0-9_]+/g, '_').replace(/^_|_$/g, '') || 'task';
  return `etl_${safe}_${versionId}`;
}

function dagFilePath(name: string, versionId: number): string {
  return path.join(dagsDir(), `${safeDagFileBase(name, versionId)}.py`);
}

function deleteDagFileIfExists(name: string, versionId: number): void {
  const dir = dagsDir();
  if (!dir) return;
  const fp = path.join(dir, `${safeDagFileBase(name, versionId)}.py`);
  try {
    fs.unlinkSync(fp);
  } catch {
    /* ignore */
  }
}

function mapSession(row: Record<string, unknown>) {
  return {
    id: row.id,
    title: row.title,
    draftSql: row.draft_sql,
    defaultContext: row.default_context,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapSubmissionSummary(row: Record<string, unknown>) {
  return {
    id: row.id,
    sessionId: row.session_id,
    sqlText: row.sql_text,
    status: row.status,
    errorMessage: row.error_message,
    submittedAt: row.submitted_at,
    finishedAt: row.finished_at,
    durationMs: row.duration_ms,
    rowsReturned: row.rows_returned,
  };
}

function mapSubmissionFull(row: Record<string, unknown>) {
  return {
    ...mapSubmissionSummary(row),
    resultSchemaJson: row.result_schema_json,
    resultPreviewJson: row.result_preview_json,
  };
}

function mapTaskVersion(row: Record<string, unknown>) {
  return {
    id: row.id,
    name: row.name,
    remark: row.remark,
    isPublished: row.is_published,
    graphJson: row.graph_json,
    sqlMain: row.sql_main,
    airflowOptionsJson: row.airflow_options_json,
    qualityRulesJson: row.quality_rules_json,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapAirflowDeployment(row: Record<string, unknown>) {
  return {
    id: row.id,
    etlTaskVersionId: row.etl_task_version_id,
    airflowDagId: row.airflow_dag_id,
    logicalTaskName: row.logical_task_name,
    dagFilePath: row.dag_file_path,
    generator: row.generator,
    createdAt: row.created_at,
  };
}

function mapEtlFolder(row: Record<string, unknown>) {
  return {
    id: row.id,
    name: row.name,
    parent_id: row.parent_id,
    sort_order: row.sort_order,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

// --- ETL folders (library tree) ---

router.get('/folders', async (_req: Request, res: Response): Promise<void> => {
  try {
    const result = await pool.query(
      'SELECT id, name, parent_id, sort_order, created_at, updated_at FROM etl_folders ORDER BY sort_order, name'
    );
    res.json({ folders: result.rows.map(mapEtlFolder) });
  } catch (error) {
    console.error('Error listing etl folders:', error);
    res.status(500).json({ error: 'Failed to list folders' });
  }
});

router.post('/folders', async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, parentId, sortOrder } = req.body || {};
    if (!name || typeof name !== 'string' || !name.trim()) {
      res.status(400).json({ error: 'name is required' });
      return;
    }
    const result = await pool.query(
      `INSERT INTO etl_folders (name, parent_id, sort_order)
       VALUES ($1, $2, $3)
       RETURNING id, name, parent_id, sort_order, created_at, updated_at`,
      [name.trim(), parentId || null, sortOrder ?? 0]
    );
    res.status(201).json({ folder: mapEtlFolder(result.rows[0]) });
  } catch (error) {
    console.error('Error creating etl folder:', error);
    res.status(500).json({ error: 'Failed to create folder' });
  }
});

router.put('/folders/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = parseInt(String(req.params.id), 10);
    if (Number.isNaN(id)) {
      res.status(400).json({ error: 'Invalid id' });
      return;
    }
    const body = req.body || {};
    const { name, sortOrder } = body;
    const existing = await pool.query('SELECT id FROM etl_folders WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      res.status(404).json({ error: 'Folder not found' });
      return;
    }

    const updates: string[] = [];
    const values: unknown[] = [];
    let i = 1;
    if (typeof name === 'string') {
      updates.push(`name = $${i++}`);
      values.push(name);
    }
    if ('parentId' in body) {
      updates.push(`parent_id = $${i++}`);
      values.push(body.parentId == null ? null : body.parentId);
    }
    if (typeof sortOrder === 'number' && !Number.isNaN(sortOrder)) {
      updates.push(`sort_order = $${i++}`);
      values.push(sortOrder);
    }
    if (updates.length === 0) {
      res.status(400).json({ error: 'No updates' });
      return;
    }
    values.push(id);
    const result = await pool.query(
      `UPDATE etl_folders SET ${updates.join(', ')} WHERE id = $${i} RETURNING id, name, parent_id, sort_order, created_at, updated_at`,
      values
    );
    res.json({ folder: mapEtlFolder(result.rows[0]) });
  } catch (error) {
    console.error('Error updating etl folder:', error);
    res.status(500).json({ error: 'Failed to update folder' });
  }
});

router.delete('/folders/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = parseInt(String(req.params.id), 10);
    if (Number.isNaN(id)) {
      res.status(400).json({ error: 'Invalid id' });
      return;
    }
    const result = await pool.query('DELETE FROM etl_folders WHERE id = $1 RETURNING id', [id]);
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Folder not found' });
      return;
    }
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting etl folder:', error);
    res.status(500).json({ error: 'Failed to delete folder' });
  }
});

// --- Ad-hoc sessions ---

router.post('/adhoc/sessions', async (req: Request, res: Response): Promise<void> => {
  try {
    const title =
      typeof req.body?.title === 'string' && req.body.title.trim()
        ? req.body.title.trim()
        : `Ad-hoc · ${new Date().toLocaleString('zh-CN')}`;
    const result = await pool.query(
      `INSERT INTO etl_adhoc_sessions (title, draft_sql)
       VALUES ($1, $2)
       RETURNING id, title, draft_sql, default_context, created_at, updated_at`,
      [title, typeof req.body?.draftSql === 'string' ? req.body.draftSql : '']
    );
    res.status(201).json({ session: mapSession(result.rows[0]) });
  } catch (error) {
    console.error('Error creating adhoc session:', error);
    res.status(500).json({ error: 'Failed to create session' });
  }
});

router.patch('/adhoc/sessions/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = parseInt(String(req.params.id), 10);
    if (Number.isNaN(id)) {
      res.status(400).json({ error: 'Invalid id' });
      return;
    }
    const { title, draftSql } = req.body || {};
    const updates: string[] = [];
    const values: unknown[] = [];
    let i = 1;
    if (typeof title === 'string') {
      updates.push(`title = $${i++}`);
      values.push(title);
    }
    if (typeof draftSql === 'string') {
      updates.push(`draft_sql = $${i++}`);
      values.push(draftSql);
    }
    if (updates.length === 0) {
      res.status(400).json({ error: 'No updates' });
      return;
    }
    values.push(id);
    const result = await pool.query(
      `UPDATE etl_adhoc_sessions SET ${updates.join(', ')} WHERE id = $${i}
       RETURNING id, title, draft_sql, default_context, created_at, updated_at`,
      values
    );
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }
    res.json({ session: mapSession(result.rows[0]) });
  } catch (error) {
    console.error('Error updating adhoc session:', error);
    res.status(500).json({ error: 'Failed to update session' });
  }
});

router.get('/adhoc/sessions/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = parseInt(String(req.params.id), 10);
    if (Number.isNaN(id)) {
      res.status(400).json({ error: 'Invalid id' });
      return;
    }
    const limitSubmissions = Math.min(parseInt(String(req.query.limitSubmissions || '50'), 10) || 50, 200);
    const s = await pool.query(
      'SELECT id, title, draft_sql, default_context, created_at, updated_at FROM etl_adhoc_sessions WHERE id = $1',
      [id]
    );
    if (s.rows.length === 0) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }
    const subs = await pool.query(
      `SELECT id, session_id, sql_text, status, error_message, submitted_at, finished_at, duration_ms, rows_returned
       FROM etl_adhoc_submissions WHERE session_id = $1 ORDER BY submitted_at DESC LIMIT $2`,
      [id, limitSubmissions]
    );
    res.json({
      session: mapSession(s.rows[0]),
      recentSubmissions: subs.rows.map(mapSubmissionSummary),
    });
  } catch (error) {
    console.error('Error loading adhoc session:', error);
    res.status(500).json({ error: 'Failed to load session' });
  }
});

router.get('/adhoc/sessions/:id/submissions', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = parseInt(String(req.params.id), 10);
    if (Number.isNaN(id)) {
      res.status(400).json({ error: 'Invalid id' });
      return;
    }
    const offset = Math.max(0, parseInt(String(req.query.offset || '0'), 10) || 0);
    const limit = Math.min(Math.max(1, parseInt(String(req.query.limit || '30'), 10) || 30), 100);
    const countR = await pool.query(
      'SELECT COUNT(*)::int AS c FROM etl_adhoc_submissions WHERE session_id = $1',
      [id]
    );
    const list = await pool.query(
      `SELECT id, session_id, sql_text, status, error_message, submitted_at, finished_at, duration_ms, rows_returned
       FROM etl_adhoc_submissions WHERE session_id = $1 ORDER BY submitted_at DESC OFFSET $2 LIMIT $3`,
      [id, offset, limit]
    );
    res.json({
      total: countR.rows[0].c,
      submissions: list.rows.map(mapSubmissionSummary),
    });
  } catch (error) {
    console.error('Error listing submissions:', error);
    res.status(500).json({ error: 'Failed to list submissions' });
  }
});

router.post('/adhoc/sessions/:id/submit', async (req: Request, res: Response): Promise<void> => {
  const client = await pool.connect();
  try {
    const sessionId = parseInt(String(req.params.id), 10);
    if (Number.isNaN(sessionId)) {
      res.status(400).json({ error: 'Invalid session id' });
      return;
    }
    const sql = typeof req.body?.sql === 'string' ? req.body.sql : '';
    if (!sql.trim()) {
      res.status(400).json({ error: 'sql is required' });
      return;
    }
    const sessionCheck = await client.query('SELECT id FROM etl_adhoc_sessions WHERE id = $1', [sessionId]);
    if (sessionCheck.rows.length === 0) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    try {
      assertSingleSqlStatement(sql);
    } catch (ve: unknown) {
      const msg = ve instanceof Error ? ve.message : 'Invalid SQL';
      res.status(400).json({ error: msg });
      return;
    }

    const ins = await client.query(
      `INSERT INTO etl_adhoc_submissions (session_id, sql_text, status)
       VALUES ($1, $2, 'running')
       RETURNING id`,
      [sessionId, sql]
    );
    const submissionId = ins.rows[0].id as number;
    const t0 = Date.now();
    try {
      const run = await executeUserSql(sql);
      const preview = trimRowsToPreview(run.rows);
      const duration = Date.now() - t0;
      const schemaJson = JSON.stringify(run.columns);
      const previewJson = JSON.stringify(preview);
      await client.query(
        `UPDATE etl_adhoc_submissions SET
          status = 'success',
          finished_at = CURRENT_TIMESTAMP,
          duration_ms = $2,
          rows_returned = $3,
          result_schema_json = $4::jsonb,
          result_preview_json = $5::jsonb
         WHERE id = $1`,
        [submissionId, duration, run.rowCount, schemaJson, previewJson]
      );
      await client.query('UPDATE etl_adhoc_sessions SET draft_sql = $2 WHERE id = $1', [sessionId, sql]);
      const full = await client.query('SELECT * FROM etl_adhoc_submissions WHERE id = $1', [submissionId]);
      res.status(201).json({ submission: mapSubmissionFull(full.rows[0]) });
    } catch (execErr: unknown) {
      const message = execErr instanceof Error ? execErr.message : 'Execution failed';
      await client.query(
        `UPDATE etl_adhoc_submissions SET
          status = 'failed',
          finished_at = CURRENT_TIMESTAMP,
          duration_ms = $2,
          error_message = $3
         WHERE id = $1`,
        [submissionId, Date.now() - t0, message]
      );
      const full = await client.query('SELECT * FROM etl_adhoc_submissions WHERE id = $1', [submissionId]);
      res.status(201).json({ submission: mapSubmissionFull(full.rows[0]) });
    }
  } catch (error) {
    console.error('Error submitting adhoc sql:', error);
    res.status(500).json({ error: 'Failed to submit' });
  } finally {
    client.release();
  }
});

router.get('/adhoc/submissions/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = parseInt(String(req.params.id), 10);
    if (Number.isNaN(id)) {
      res.status(400).json({ error: 'Invalid id' });
      return;
    }
    const result = await pool.query('SELECT * FROM etl_adhoc_submissions WHERE id = $1', [id]);
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Submission not found' });
      return;
    }
    res.json({ submission: mapSubmissionFull(result.rows[0]) });
  } catch (error) {
    console.error('Error loading submission:', error);
    res.status(500).json({ error: 'Failed to load submission' });
  }
});

router.get('/adhoc/submissions/:id/result', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = parseInt(String(req.params.id), 10);
    if (Number.isNaN(id)) {
      res.status(400).json({ error: 'Invalid id' });
      return;
    }
    const offset = Math.max(0, parseInt(String(req.query.offset || '0'), 10) || 0);
    const limit = Math.min(Math.max(1, parseInt(String(req.query.limit || '100'), 10) || 100), 500);
    const result = await pool.query(
      'SELECT result_schema_json, result_preview_json, rows_returned, status FROM etl_adhoc_submissions WHERE id = $1',
      [id]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Submission not found' });
      return;
    }
    const row = result.rows[0];
    const rawPreview = row.result_preview_json;
    const allRows = Array.isArray(rawPreview) ? (rawPreview as Record<string, unknown>[]) : [];
    const slice = allRows.slice(offset, offset + limit);
    res.json({
      columns: row.result_schema_json || [],
      rows: slice,
      total: allRows.length,
      offset,
      limit,
      status: row.status,
    });
  } catch (error) {
    console.error('Error loading result:', error);
    res.status(500).json({ error: 'Failed to load result' });
  }
});

// --- Task development ---

router.get('/tasks', async (_req: Request, res: Response): Promise<void> => {
  try {
    const result = await pool.query(
      `SELECT v1.name,
              COUNT(*)::int AS version_count,
              MAX(v1.created_at) AS updated_at,
              (SELECT id FROM etl_task_versions v2 WHERE v2.name = v1.name AND v2.is_published = true LIMIT 1) AS published_version_id,
              ft.folder_id,
              COALESCE(ft.sort_order, 0) AS folder_sort_order
       FROM etl_task_versions v1
       LEFT JOIN etl_folder_tasks ft ON ft.task_name = v1.name
       GROUP BY v1.name, ft.folder_id, ft.sort_order
       ORDER BY MAX(v1.created_at) DESC`
    );
    res.json({ tasks: result.rows });
  } catch (error) {
    console.error('Error listing etl tasks:', error);
    res.status(500).json({ error: 'Failed to list tasks' });
  }
});

/** Delete logical task: all versions (deployments cascade), folder placement, and published DAG files. */
router.delete('/tasks', async (req: Request, res: Response): Promise<void> => {
  try {
    const name = typeof req.query.name === 'string' ? req.query.name.trim() : '';
    if (!name) {
      res.status(400).json({ error: 'name query is required' });
      return;
    }

    const versions = await pool.query('SELECT id, is_published FROM etl_task_versions WHERE name = $1', [name]);
    if (versions.rows.length === 0) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }

    for (const row of versions.rows) {
      if (row.is_published) {
        deleteDagFileIfExists(name, row.id as number);
      }
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM etl_task_versions WHERE name = $1', [name]);
      await client.query('DELETE FROM etl_folder_tasks WHERE task_name = $1', [name]);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting etl task:', error);
    res.status(500).json({ error: 'Failed to delete task' });
  }
});

router.patch('/tasks/placement', async (req: Request, res: Response): Promise<void> => {
  try {
    const taskName = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    if (!taskName) {
      res.status(400).json({ error: 'name is required' });
      return;
    }
    const { folderId, sortOrder } = req.body || {};
    const hasFolder = 'folderId' in (req.body || {});
    let fid: number | null | undefined;
    if (!hasFolder) {
      fid = undefined;
    } else if (folderId === null || folderId === '') {
      fid = null;
    } else if (typeof folderId === 'number' && !Number.isNaN(folderId)) {
      fid = folderId;
    } else if (typeof folderId === 'string' && folderId.trim() !== '') {
      const p = parseInt(folderId, 10);
      fid = Number.isNaN(p) ? undefined : p;
    } else {
      fid = undefined;
    }
    if (hasFolder && fid === undefined) {
      res.status(400).json({ error: 'Invalid folderId' });
      return;
    }
    if (fid != null) {
      const chk = await pool.query('SELECT id FROM etl_folders WHERE id = $1', [fid]);
      if (chk.rows.length === 0) {
        res.status(404).json({ error: 'Folder not found' });
        return;
      }
    }
    const sort =
      typeof sortOrder === 'number' && !Number.isNaN(sortOrder)
        ? sortOrder
        : typeof sortOrder === 'string' && sortOrder !== ''
          ? parseInt(sortOrder, 10)
          : null;

    const exists = await pool.query('SELECT 1 FROM etl_task_versions WHERE name = $1 LIMIT 1', [taskName]);
    if (exists.rows.length === 0) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }

    if (hasFolder && fid === null) {
      await pool.query(
        `INSERT INTO etl_folder_tasks (folder_id, task_name, sort_order)
         VALUES (NULL, $1, COALESCE($2::int, 0))
         ON CONFLICT (task_name) DO UPDATE SET
           folder_id = NULL,
           sort_order = COALESCE($2::int, etl_folder_tasks.sort_order),
           updated_at = CURRENT_TIMESTAMP`,
        [taskName, sort]
      );
    } else if (hasFolder && fid != null) {
      await pool.query(
        `INSERT INTO etl_folder_tasks (folder_id, task_name, sort_order)
         VALUES ($1, $2, COALESCE($3::int, 0))
         ON CONFLICT (task_name) DO UPDATE SET
           folder_id = EXCLUDED.folder_id,
           sort_order = COALESCE($3::int, etl_folder_tasks.sort_order),
           updated_at = CURRENT_TIMESTAMP`,
        [fid, taskName, sort]
      );
    } else if (sort != null && !Number.isNaN(sort)) {
      const up = await pool.query(
        `UPDATE etl_folder_tasks SET sort_order = $2, updated_at = CURRENT_TIMESTAMP WHERE task_name = $1`,
        [taskName, sort]
      );
      if (up.rowCount === 0) {
        await pool.query(
          `INSERT INTO etl_folder_tasks (folder_id, task_name, sort_order)
           VALUES ((SELECT id FROM etl_folders ORDER BY id LIMIT 1), $1, $2)
           ON CONFLICT (task_name) DO UPDATE SET
             sort_order = EXCLUDED.sort_order,
             updated_at = CURRENT_TIMESTAMP`,
          [taskName, sort]
        );
      }
    } else {
      res.status(400).json({ error: 'folderId or sortOrder required' });
      return;
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error patching etl task placement:', error);
    res.status(500).json({ error: 'Failed to update placement' });
  }
});

router.get('/tasks/versions', async (req: Request, res: Response): Promise<void> => {
  try {
    const name = req.query.name;
    if (!name || typeof name !== 'string') {
      res.status(400).json({ error: 'name query is required' });
      return;
    }
    const result = await pool.query(
      `SELECT id, name, remark, is_published, graph_json, sql_main, airflow_options_json, quality_rules_json, created_at, updated_at
       FROM etl_task_versions WHERE name = $1 ORDER BY created_at DESC`,
      [name]
    );
    res.json({ versions: result.rows.map(mapTaskVersion) });
  } catch (error) {
    console.error('Error listing task versions:', error);
    res.status(500).json({ error: 'Failed to list versions' });
  }
});

router.get('/tasks/versions/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = parseInt(String(req.params.id), 10);
    if (Number.isNaN(id)) {
      res.status(400).json({ error: 'Invalid id' });
      return;
    }
    const result = await pool.query(
      `SELECT id, name, remark, is_published, graph_json, sql_main, airflow_options_json, quality_rules_json, created_at, updated_at
       FROM etl_task_versions WHERE id = $1`,
      [id]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Version not found' });
      return;
    }
    res.json({ version: mapTaskVersion(result.rows[0]) });
  } catch (error) {
    console.error('Error loading task version:', error);
    res.status(500).json({ error: 'Failed to load version' });
  }
});

router.get('/tasks/versions/:id/deployments', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = parseInt(String(req.params.id), 10);
    if (Number.isNaN(id)) {
      res.status(400).json({ error: 'Invalid id' });
      return;
    }
    const exists = await pool.query('SELECT 1 FROM etl_task_versions WHERE id = $1', [id]);
    if (exists.rows.length === 0) {
      res.status(404).json({ error: 'Version not found' });
      return;
    }
    const result = await pool.query(
      `SELECT id, etl_task_version_id, airflow_dag_id, logical_task_name, dag_file_path, generator, created_at
       FROM etl_airflow_deployments WHERE etl_task_version_id = $1 ORDER BY created_at DESC`,
      [id]
    );
    res.json({ deployments: result.rows.map(mapAirflowDeployment) });
  } catch (error) {
    console.error('Error listing deployments:', error);
    res.status(500).json({ error: 'Failed to list deployments' });
  }
});

router.post('/tasks/versions', async (req: Request, res: Response): Promise<void> => {
  try {
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    if (!name) {
      res.status(400).json({ error: 'name is required' });
      return;
    }
    const remark = typeof req.body?.remark === 'string' ? req.body.remark : '';
    const sqlMain = typeof req.body?.sqlMain === 'string' ? req.body.sqlMain : '';
    const graphJson = req.body?.graphJson ?? {};
    const airflowOptionsJson = req.body?.airflowOptionsJson ?? {};
    const qualityRulesJson = req.body?.qualityRulesJson ?? [];
    const body = req.body || {};
    const hasFolderKey = 'folderId' in body;
    const rawFolderId = body.folderId;
    let placementFolderId: number | null | undefined;
    if (hasFolderKey) {
      if (rawFolderId === null || rawFolderId === '') {
        placementFolderId = null;
      } else if (typeof rawFolderId === 'number' && !Number.isNaN(rawFolderId)) {
        placementFolderId = rawFolderId;
      } else if (typeof rawFolderId === 'string') {
        const p = parseInt(rawFolderId, 10);
        placementFolderId = Number.isNaN(p) ? undefined : p;
      } else {
        placementFolderId = undefined;
      }
    }
    if (hasFolderKey && rawFolderId != null && rawFolderId !== '' && placementFolderId === undefined) {
      res.status(400).json({ error: 'Invalid folderId' });
      return;
    }
    if (placementFolderId !== null && placementFolderId !== undefined) {
      const chk = await pool.query('SELECT id FROM etl_folders WHERE id = $1', [placementFolderId]);
      if (chk.rows.length === 0) {
        res.status(404).json({ error: 'Folder not found' });
        return;
      }
    }

    const result = await pool.query(
      `INSERT INTO etl_task_versions (name, remark, graph_json, sql_main, airflow_options_json, quality_rules_json)
       VALUES ($1, $2, $3::jsonb, $4, $5::jsonb, $6::jsonb)
       RETURNING id, name, remark, is_published, graph_json, sql_main, airflow_options_json, quality_rules_json, created_at, updated_at`,
      [name, remark, JSON.stringify(graphJson), sqlMain, JSON.stringify(airflowOptionsJson), JSON.stringify(qualityRulesJson)]
    );

    if (hasFolderKey) {
      const fid = placementFolderId === undefined ? null : placementFolderId;
      await pool.query(
        `INSERT INTO etl_folder_tasks (folder_id, task_name, sort_order)
         VALUES ($1, $2, 0)
         ON CONFLICT (task_name) DO UPDATE SET
           folder_id = EXCLUDED.folder_id,
           updated_at = CURRENT_TIMESTAMP`,
        [fid, name]
      );
    } else {
      await pool.query(
        `INSERT INTO etl_folder_tasks (folder_id, task_name, sort_order)
         VALUES ((SELECT id FROM etl_folders ORDER BY id LIMIT 1), $1, 0)
         ON CONFLICT (task_name) DO NOTHING`,
        [name]
      );
    }

    res.status(201).json({ version: mapTaskVersion(result.rows[0]) });
  } catch (error) {
    console.error('Error saving task version:', error);
    res.status(500).json({ error: 'Failed to save version' });
  }
});

router.put('/tasks/versions/:id/publish', async (req: Request, res: Response): Promise<void> => {
  const client = await pool.connect();
  try {
    const id = parseInt(String(req.params.id), 10);
    if (Number.isNaN(id)) {
      res.status(400).json({ error: 'Invalid id' });
      return;
    }

    await client.query('BEGIN');
    const versionResult = await client.query(
      'SELECT id, name, sql_main, airflow_options_json, quality_rules_json, graph_json FROM etl_task_versions WHERE id = $1',
      [id]
    );
    if (versionResult.rows.length === 0) {
      await client.query('ROLLBACK');
      res.status(404).json({ error: 'Version not found' });
      return;
    }
    const row = versionResult.rows[0];
    const logicalName = row.name as string;
    const oldPublished = await client.query(
      'SELECT id FROM etl_task_versions WHERE name = $1 AND is_published = true',
      [logicalName]
    );

    await client.query('UPDATE etl_task_versions SET is_published = false WHERE name = $1 AND is_published = true', [
      logicalName,
    ]);
    const upd = await client.query(
      `UPDATE etl_task_versions SET is_published = true WHERE id = $1
       RETURNING id, name, remark, is_published, graph_json, sql_main, airflow_options_json, quality_rules_json, created_at, updated_at`,
      [id]
    );

    const dir = dagsDir();
    if (dir) {
      try {
        for (const old of oldPublished.rows) {
          const oid = old.id as number;
          if (oid !== id) {
            deleteDagFileIfExists(logicalName, oid);
          }
        }
        fs.mkdirSync(dir, { recursive: true });
        const airflowOptions = (row.airflow_options_json || {}) as AirflowOptions;
        const qualityRules = (row.quality_rules_json || []) as QualityRule[];
        const graphJson = row.graph_json;
        const dagResult = await generateDagPythonWithFallback({
          versionId: id,
          logicalName,
          sqlMain: (row.sql_main as string) || '',
          airflowOptions,
          qualityRules,
          graphJson,
        });
        const outPath = dagFilePath(logicalName, id);
        fs.writeFileSync(outPath, dagResult.pythonSource, 'utf8');
        await client.query(
          `INSERT INTO etl_airflow_deployments (etl_task_version_id, airflow_dag_id, logical_task_name, dag_file_path, generator)
           VALUES ($1, $2, $3, $4, $5)`,
          [id, dagResult.dagId, logicalName, outPath, dagResult.generator]
        );
        console.log(`ETL published: wrote ${safeDagFileBase(logicalName, id)}.py to ${dir} (${dagResult.generator})`);
      } catch (fileError) {
        console.error('Error writing DAG file:', fileError);
      }
    } else {
      console.warn('ETL publish: ETL_AIRFLOW_DAGS_DIR and AIRFLOW_HOME unset; skipping DAG file write');
    }

    await client.query('COMMIT');
    res.json({ version: mapTaskVersion(upd.rows[0]) });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error publishing task version:', error);
    res.status(500).json({ error: 'Failed to publish' });
  } finally {
    client.release();
  }
});

router.post('/tasks/dry-run', async (req: Request, res: Response): Promise<void> => {
  try {
    const sql = typeof req.body?.sql === 'string' ? req.body.sql : '';
    if (!sql.trim()) {
      res.status(400).json({ error: 'sql is required' });
      return;
    }
    try {
      assertSingleSqlStatement(sql);
    } catch (ve: unknown) {
      const msg = ve instanceof Error ? ve.message : 'Invalid SQL';
      res.status(400).json({ error: msg });
      return;
    }
    const t0 = Date.now();
    const run = await executeUserSql(sql);
    res.json({
      durationMs: Date.now() - t0,
      columns: run.columns,
      rows: trimRowsToPreview(run.rows),
      rowCount: run.rowCount,
    });
  } catch (error) {
    console.error('Error dry-run (ad-hoc body):', error);
    res.status(500).json({ error: 'Dry-run failed' });
  }
});

router.post('/tasks/versions/:id/dry-run', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = parseInt(String(req.params.id), 10);
    if (Number.isNaN(id)) {
      res.status(400).json({ error: 'Invalid id' });
      return;
    }
    const version = await pool.query('SELECT sql_main FROM etl_task_versions WHERE id = $1', [id]);
    if (version.rows.length === 0) {
      res.status(404).json({ error: 'Version not found' });
      return;
    }
    const override = typeof req.body?.sql === 'string' ? req.body.sql : null;
    const sql = (override ?? version.rows[0].sql_main) as string;
    try {
      assertSingleSqlStatement(sql);
    } catch (ve: unknown) {
      const msg = ve instanceof Error ? ve.message : 'Invalid SQL';
      res.status(400).json({ error: msg });
      return;
    }
    const t0 = Date.now();
    const run = await executeUserSql(sql);
    res.json({
      durationMs: Date.now() - t0,
      columns: run.columns,
      rows: trimRowsToPreview(run.rows),
      rowCount: run.rowCount,
    });
  } catch (error) {
    console.error('Error dry-run:', error);
    res.status(500).json({ error: 'Dry-run failed' });
  }
});

router.delete('/tasks/versions/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = parseInt(String(req.params.id), 10);
    if (Number.isNaN(id)) {
      res.status(400).json({ error: 'Invalid id' });
      return;
    }
    const check = await pool.query('SELECT name, is_published FROM etl_task_versions WHERE id = $1', [id]);
    if (check.rows.length === 0) {
      res.status(404).json({ error: 'Version not found' });
      return;
    }
    if (check.rows[0].is_published) {
      const name = check.rows[0].name as string;
      deleteDagFileIfExists(name, id);
    }
    await pool.query('DELETE FROM etl_task_versions WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting task version:', error);
    res.status(500).json({ error: 'Failed to delete' });
  }
});

export default router;
