import { Router, Request, Response } from 'express';
import { pool } from '../config/postgres.js';
import { defaultCatalog, parseOutputTableFromTaskInfo } from '../services/etlOutputTable.js';
import {
  normalizeSecondaryPartitions,
  resolvePrimaryPartitionKey,
  partitionDateFromKey,
} from '../services/etlPartitionResolve.js';
import { isPartitionReady, upsertPartitionDetail } from '../services/etlPartitionDetailRepo.js';
import {
  parseQualityRulesBundle,
  hasExecutableQuality,
  evaluateQualityRules,
} from '../services/etlQualityBundle.js';
import { assertSingleSqlStatement, executeUserSql } from '../services/sqlQueryRunner.js';
import {
  enqueueAlertFromRules,
  deliverPendingAlerts,
  parseAlertRulesFromOptions,
} from '../services/etlAlertService.js';

const router: Router = Router();

function authDispatch(req: Request, res: Response): boolean {
  const secret = process.env.ETL_ALERT_DISPATCH_SECRET || '';
  if (!secret) {
    res.status(503).json({ error: 'ETL_ALERT_DISPATCH_SECRET is not configured' });
    return false;
  }
  const hdr = req.headers.authorization || '';
  const token = hdr.startsWith('Bearer ') ? hdr.slice(7).trim() : '';
  if (token !== secret) {
    res.status(401).json({ error: 'Unauthorized' });
    return false;
  }
  return true;
}

/** POST /runtime-deps/check-ready */
router.post('/runtime-deps/check-ready', async (req: Request, res: Response): Promise<void> => {
  try {
    const body = req.body || {};
    const database = typeof body.database === 'string' ? body.database.trim() : '';
    const table = typeof body.table === 'string' ? body.table.trim() : '';
    const partition = typeof body.partition === 'string' ? body.partition.trim() : '';
    const logicalDate = typeof body.logicalDate === 'string' ? body.logicalDate.trim() : '';
    const catalog =
      typeof body.catalog === 'string' && body.catalog.trim()
        ? body.catalog.trim()
        : defaultCatalog();
    const secondaryPartitions =
      typeof body.secondaryPartitions === 'string' ? body.secondaryPartitions : '';

    if (!database || !table || !partition || !logicalDate) {
      res.status(400).json({ error: 'database, table, partition, logicalDate are required' });
      return;
    }

    let primaryKey: string;
    try {
      primaryKey = resolvePrimaryPartitionKey(partition, logicalDate);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Invalid partition';
      res.status(400).json({ error: msg });
      return;
    }
    const secondaryNorm = normalizeSecondaryPartitions(secondaryPartitions);

    const client = await pool.connect();
    try {
      const ready = await isPartitionReady(client, {
        catalog,
        database,
        table,
        primaryPartitionKey: primaryKey,
        secondaryNormalized: secondaryNorm,
      });
      res.json({ ready });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('check-ready:', error);
    res.status(500).json({ error: 'check-ready failed' });
  }
});

/** POST /task-runs/start */
router.post('/task-runs/start', async (req: Request, res: Response): Promise<void> => {
  try {
    const body = req.body || {};
    const etlTaskVersionId = parseInt(String(body.etlTaskVersionId ?? ''), 10);
    const partitionDateStr = typeof body.partitionDate === 'string' ? body.partitionDate.trim() : '';
    const airflowDagId = typeof body.airflowDagId === 'string' ? body.airflowDagId.trim() : '';
    const airflowRunId = typeof body.airflowRunId === 'string' ? body.airflowRunId.trim() : '';
    const airflowTaskId = typeof body.airflowTaskId === 'string' ? body.airflowTaskId.trim() : '';
    const tryNumber = parseInt(String(body.tryNumber ?? '1'), 10) || 1;
    const startedAtRaw = body.startedAt;

    if (
      Number.isNaN(etlTaskVersionId) ||
      !partitionDateStr ||
      !airflowDagId ||
      !airflowRunId ||
      !airflowTaskId
    ) {
      res.status(400).json({
        error: 'etlTaskVersionId, partitionDate, airflowDagId, airflowRunId, airflowTaskId are required',
      });
      return;
    }

    const ver = await pool.query(
      `SELECT v.id FROM etl_task_versions v WHERE v.id = $1`,
      [etlTaskVersionId]
    );
    if (ver.rows.length === 0) {
      res.status(404).json({ error: 'Version not found' });
      return;
    }
    const startedAt =
      typeof startedAtRaw === 'string' && startedAtRaw
        ? new Date(startedAtRaw)
        : new Date();

    const ins = await pool.query(
      `INSERT INTO etl_task_run_instances (
         partition_date, attempt, start_time, end_time, status,
         etl_task_version_id, airflow_dag_id, airflow_run_id, airflow_task_id,
         airflow_try_number
       ) VALUES (
         $1::date, $2, $3, NULL, 'running',
         $4, $5, $6, $7, $8
       )
       RETURNING id`,
      [
        partitionDateStr,
        tryNumber,
        startedAt,
        etlTaskVersionId,
        airflowDagId,
        airflowRunId,
        airflowTaskId,
        tryNumber,
      ]
    );

    const id = ins.rows[0].id as number;
    res.status(201).json({ taskInstanceId: id });
  } catch (error) {
    console.error('task-runs/start:', error);
    res.status(500).json({ error: 'Failed to start task run' });
  }
});

/** PATCH /task-runs/:id/complete */
router.patch('/task-runs/:id/complete', async (req: Request, res: Response): Promise<void> => {
  const client = await pool.connect();
  try {
    const id = parseInt(String(req.params.id), 10);
    if (Number.isNaN(id)) {
      res.status(400).json({ error: 'Invalid id' });
      return;
    }
    const body = req.body || {};
    const status = body.status === 'success' || body.status === 'failed' ? body.status : null;
    const endedAtRaw = body.endedAt;
    const errorMessage = typeof body.errorMessage === 'string' ? body.errorMessage : null;

    if (!status) {
      res.status(400).json({ error: 'status must be success or failed' });
      return;
    }

    const endedAt =
      typeof endedAtRaw === 'string' && endedAtRaw ? new Date(endedAtRaw) : new Date();

    await client.query('BEGIN');

    const cur = await client.query(
      `SELECT ri.id, ri.etl_task_version_id, ri.partition_date, ri.status AS prev_status,
              v.schedule_json, v.alert_json, v.quality_rules_json,
              i.catalog_name, i.database_name, i.table_name
       FROM etl_task_run_instances ri
       JOIN etl_task_versions v ON v.id = ri.etl_task_version_id
       JOIN etl_task_info i ON i.id = v.etl_task_id
       WHERE ri.id = $1`,
      [id]
    );
    if (cur.rows.length === 0) {
      await client.query('ROLLBACK');
      res.status(404).json({ error: 'Task instance not found' });
      return;
    }

    const row = cur.rows[0];
    const etlVid = row.etl_task_version_id as number;
    const partitionDate = row.partition_date as Date;
    const qualityBundle = parseQualityRulesBundle(row.quality_rules_json);
    const hasQuality = hasExecutableQuality(qualityBundle);
    const outputTable = parseOutputTableFromTaskInfo({
      catalog_name: row.catalog_name as string | null,
      database_name: row.database_name as string | null,
      table_name: row.table_name as string | null,
    });

    await client.query(
      `UPDATE etl_task_run_instances
       SET status = $2, end_time = $3, error_message = $4
       WHERE id = $1`,
      [id, status, endedAt, status === 'failed' ? errorMessage : null]
    );

    if (status === 'success' && outputTable && !hasQuality) {
      const primaryKey =
        typeof body.resolvedPrimaryPartitionKey === 'string' && body.resolvedPrimaryPartitionKey.trim()
          ? body.resolvedPrimaryPartitionKey.trim()
          : partitionDate.toISOString().slice(0, 10);
      const secondaryNorm =
        typeof body.resolvedSecondaryPartitionKey === 'string'
          ? normalizeSecondaryPartitions(body.resolvedSecondaryPartitionKey)
          : '';
      const cat = outputTable.catalog || defaultCatalog();
      const partitionRowId = await upsertPartitionDetail(client, {
        catalog: cat,
        database: outputTable.database,
        table: outputTable.table,
        primaryPartitionKey: primaryKey,
        secondaryNormalized: secondaryNorm,
        partitionDate: partitionDateFromKey(primaryKey),
        etlTaskVersionId: etlVid,
        isVerified: true,
        runningStatus: 'succeeded',
      });
      await client.query(`UPDATE etl_task_run_instances SET table_partition_id = $2 WHERE id = $1`, [
        id,
        partitionRowId,
      ]);
    }

    const rules = parseAlertRulesFromOptions(row.alert_json);
    await enqueueAlertFromRules({
      client,
      source: 'etl_task_run',
      reason: status === 'failed' ? '任务运行失败' : '',
      etlTaskVersionId: etlVid,
      taskInstanceId: id,
      partitionDate,
      status,
      endedAt,
      rules,
    });

    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('task-runs/complete:', error);
    res.status(500).json({ error: 'Failed to complete task run' });
  } finally {
    client.release();
  }
});

/** POST /quality/execute */
router.post('/quality/execute', async (req: Request, res: Response): Promise<void> => {
  try {
    const body = req.body || {};
    const etlTaskVersionId = parseInt(String(body.etlTaskVersionId ?? ''), 10);
    const logicalDate = typeof body.logicalDate === 'string' ? body.logicalDate.trim() : '';

    if (Number.isNaN(etlTaskVersionId) || !logicalDate) {
      res.status(400).json({ error: 'etlTaskVersionId and logicalDate are required' });
      return;
    }

    const ver = await pool.query(
      `SELECT v.id, v.quality_rules_json,
              i.catalog_name, i.database_name, i.table_name
       FROM etl_task_versions v
       JOIN etl_task_info i ON i.id = v.etl_task_id
       WHERE v.id = $1`,
      [etlTaskVersionId]
    );
    if (ver.rows.length === 0) {
      res.status(404).json({ error: 'Version not found' });
      return;
    }

    const bundle = parseQualityRulesBundle(ver.rows[0].quality_rules_json);
    if (!hasExecutableQuality(bundle)) {
      res.status(400).json({ error: 'No executable quality rules for this version' });
      return;
    }

    const vr = ver.rows[0];
    const outputTable = parseOutputTableFromTaskInfo({
      catalog_name: vr.catalog_name as string | null,
      database_name: vr.database_name as string | null,
      table_name: vr.table_name as string | null,
    });
    if (!outputTable) {
      res.status(400).json({
        error: 'etl_task_info 需配置产出表 catalog_name / database_name / table_name',
      });
      return;
    }

    const primaryKey =
      typeof body.primaryPartitionKey === 'string' && body.primaryPartitionKey.trim()
        ? body.primaryPartitionKey.trim()
        : '';
    const secondaryNorm =
      typeof body.secondaryPartitionKey === 'string'
        ? normalizeSecondaryPartitions(body.secondaryPartitionKey)
        : '';

    if (!primaryKey) {
      res.status(400).json({ error: 'primaryPartitionKey is required' });
      return;
    }

    const queryResults = [];
    for (let i = 0; i < bundle.sqlQueries.length; i++) {
      const sql = bundle.sqlQueries[i]?.trim() ?? '';
      if (!sql) {
        queryResults.push({ columns: [], rows: [], rowCount: 0 });
        continue;
      }
      assertSingleSqlStatement(sql);
      const run = await executeUserSql(sql);
      queryResults.push(run);
    }

    const evalResult = evaluateQualityRules(bundle, queryResults);
    const passed = evalResult.passed;

    const client = await pool.connect();
    try {
      const cat = outputTable.catalog || defaultCatalog();
      await upsertPartitionDetail(client, {
        catalog: cat,
        database: outputTable.database,
        table: outputTable.table,
        primaryPartitionKey: primaryKey,
        secondaryNormalized: secondaryNorm,
        partitionDate: partitionDateFromKey(primaryKey),
        etlTaskVersionId,
        isVerified: passed,
        runningStatus: passed ? 'succeeded' : 'quality_rejected',
      });
      res.json({ passed, details: evalResult.details });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('quality/execute:', error);
    const msg = error instanceof Error ? error.message : 'quality failed';
    res.status(500).json({ error: msg });
  }
});

/** POST /alerts/dispatch-tick */
router.post('/alerts/dispatch-tick', async (req: Request, res: Response): Promise<void> => {
  if (!authDispatch(req, res)) return;
  try {
    const limit = Math.min(100, Math.max(1, parseInt(String(req.body?.limit ?? '50'), 10) || 50));
    const client = await pool.connect();
    try {
      const { processed } = await deliverPendingAlerts(client, limit);
      res.json({ processed });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('dispatch-tick:', error);
    res.status(500).json({ error: 'dispatch-tick failed' });
  }
});

export default router;
