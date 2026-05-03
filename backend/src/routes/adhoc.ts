import { Router, Request, Response } from 'express';
import { pool } from '../config/postgres.js';
import { assertSingleSqlStatement, executeUserSql, trimRowsToPreview } from '../services/sqlQueryRunner.js';

const router: Router = Router();

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

router.delete('/adhoc/submissions/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = parseInt(String(req.params.id), 10);
    if (Number.isNaN(id)) {
      res.status(400).json({ error: 'Invalid id' });
      return;
    }
    const r = await pool.query('DELETE FROM etl_adhoc_submissions WHERE id = $1 RETURNING id', [id]);
    if (r.rowCount === 0) {
      res.status(404).json({ error: 'Submission not found' });
      return;
    }
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting adhoc submission:', error);
    res.status(500).json({ error: 'Failed to delete submission' });
  }
});

export default router;
