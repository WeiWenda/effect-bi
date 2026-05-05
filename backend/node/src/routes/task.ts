import { Router, Request, Response } from 'express';
import neo4j from 'neo4j-driver';
import { pool } from '../config/postgres.js';
import { getSession } from '../config/neo4j.js';
import { defaultCatalog } from '../services/etlOutputTable.js';

const router: Router = Router();

interface TaskInstance {
  partition_date: string;
  attempt: number;
  start_time: string;
  end_time: string;
  status: string;
  airflow_dag_id?: string;
  airflow_run_id?: string;
  airflow_task_id?: string;
  error_message?: string | null;
}

function toJsNumber(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === 'number' && !Number.isNaN(v)) return v;
  if (neo4j.isInt(v)) return (v as { toNumber: () => number }).toNumber();
  return null;
}

function normalizeCatalogFromNeo(v: unknown): string {
  const s = typeof v === 'string' ? v.trim() : '';
  return s || defaultCatalog();
}

/** Neo4j 节点上的 AIRFLOW_DAG_ID 与运行记录 airflow_dag_id 对齐；节点无 DAG 时仍按任务聚合 */
function runMatchesNodeAirflow(meta: { airflowDagId: string | null }, runAirflowDagId: unknown): boolean {
  const runDag = typeof runAirflowDagId === 'string' ? runAirflowDagId.trim() : '';
  const nodeDag = (meta.airflowDagId || '').trim();
  if (nodeDag && runDag) return nodeDag === runDag;
  if (nodeDag && !runDag) return false;
  return true;
}

/**
 * 链路治理 DAG 运维：按视图内库表节点关联 etl_task_info，读取 etl_task_run_instances。
 * GET /api/task/dag/:dagId?days=7
 */
router.get('/dag/:dagId', async (req: Request, res: Response): Promise<void> => {
  try {
    const { dagId } = req.params;
    const { days = '7' } = req.query;

    const dagIdStr = Array.isArray(dagId) ? dagId[0] : dagId;
    const daysNum = parseInt(days as string, 10);

    if (!dagIdStr || Number.isNaN(parseInt(dagIdStr, 10))) {
      res.status(400).json({ error: 'Valid DAG ID is required' });
      return;
    }

    const pgClient = await pool.connect();
    let nodeIds: string[];
    try {
      const pgResult = await pgClient.query(`SELECT node_ids FROM dag_views WHERE id = $1`, [dagIdStr]);

      if (pgResult.rows.length === 0) {
        res.status(404).json({ error: 'DAG view not found' });
        return;
      }

      nodeIds = pgResult.rows[0].node_ids as string[];
    } finally {
      pgClient.release();
    }

    const dependencies: { source: string; target: string }[] = [];
    const session = getSession();
    const dc = defaultCatalog();

    type NodeMeta = {
      id: string;
      catalog: string;
      database: string;
      table: string;
      etlTaskId: number | null;
      /** Neo4j 上与运行实例 airflow_dag_id 对齐 */
      airflowDagId: string | null;
    };

    const metaById = new Map<string, NodeMeta>();

    try {
      const nodeIdsParam = nodeIds;
      const qDeps = `
        MATCH (a:Table)-[r:MAKEUP]->(b:Table)
        WHERE elementId(a) IN $nodeIds AND elementId(b) IN $nodeIds
        RETURN elementId(a) AS source, elementId(b) AS target
      `;
      const depResult = await session.run(qDeps, { nodeIds: nodeIdsParam });
      depResult.records.forEach(rec => {
        dependencies.push({
          source: String(rec.get('source')),
          target: String(rec.get('target')),
        });
      });

      const qNodes = `
        MATCH (n:Table)
        WHERE elementId(n) IN $nodeIds
        RETURN elementId(n) AS id,
               n.catalog_name AS catalog_name,
               n.database_name AS database_name,
               n.table_name AS table_name,
               n.etl_task_id AS etl_task_id,
               coalesce(n.AIRFLOW_DAG_ID, n.airflow_dag_id) AS airflow_dag_id
      `;
      const nodeResult = await session.run(qNodes, { nodeIds: nodeIdsParam });
      nodeResult.records.forEach(rec => {
        const id = String(rec.get('id'));
        const db = typeof rec.get('database_name') === 'string' ? (rec.get('database_name') as string).trim() : '';
        const tb = typeof rec.get('table_name') === 'string' ? (rec.get('table_name') as string).trim() : '';
        const cat = normalizeCatalogFromNeo(rec.get('catalog_name'));
        const eti = toJsNumber(rec.get('etl_task_id'));
        const adRaw = rec.get('airflow_dag_id');
        const airflowDagId =
          typeof adRaw === 'string' && adRaw.trim() ? adRaw.trim() : null;
        metaById.set(id, {
          id,
          catalog: cat,
          database: db,
          table: tb,
          etlTaskId: eti,
          airflowDagId,
        });
      });
    } finally {
      await session.close();
    }

    const needPgResolve: NodeMeta[] = [];
    for (const nid of nodeIds) {
      const m = metaById.get(nid);
      if (!m || !m.database || !m.table) continue;
      if (m.etlTaskId == null) {
        needPgResolve.push(m);
      }
    }

    if (needPgResolve.length > 0) {
      const cats = needPgResolve.map(n => n.catalog);
      const dbs = needPgResolve.map(n => n.database);
      const tabs = needPgResolve.map(n => n.table);
      const matchRows = await pool.query(
        `
        SELECT i.id AS etl_task_id,
               COALESCE(NULLIF(TRIM(i.catalog_name), ''), $4) AS cnorm,
               i.database_name AS database_name,
               i.table_name AS table_name
        FROM unnest($1::text[], $2::text[], $3::text[]) AS t(s_cat, s_db, s_tb)
        JOIN etl_task_info i
          ON i.database_name = t.s_db
         AND i.table_name = t.s_tb
         AND COALESCE(NULLIF(TRIM(i.catalog_name), ''), $4) = COALESCE(NULLIF(TRIM(t.s_cat), ''), $4)
        `,
        [cats, dbs, tabs, dc]
      );

      const tripleKey = (c: string, d: string, t: string) => `${c}\0${d}\0${t}`;
      const resolved = new Map<string, number>();
      for (const row of matchRows.rows) {
        const k = tripleKey(
          String(row.cnorm),
          String(row.database_name),
          String(row.table_name)
        );
        resolved.set(k, row.etl_task_id as number);
      }

      for (const m of needPgResolve) {
        const k = tripleKey(m.catalog, m.database, m.table);
        const id = resolved.get(k);
        if (id != null) {
          m.etlTaskId = id;
          metaById.set(m.id, { ...m, etlTaskId: id });
        }
      }
    }

    const etlTaskToNodeIds = new Map<number, string[]>();
    for (const nid of nodeIds) {
      const m = metaById.get(nid);
      if (!m?.etlTaskId) continue;
      const list = etlTaskToNodeIds.get(m.etlTaskId) ?? [];
      list.push(nid);
      etlTaskToNodeIds.set(m.etlTaskId, list);
    }

    const orderedRowKeys = topologicalSort(nodeIds, dependencies);

    const distinctTaskIds = [...etlTaskToNodeIds.keys()];
    if (distinctTaskIds.length === 0) {
      res.json({
        rowKeys: orderedRowKeys,
        taskFiles: orderedRowKeys,
        startDate: new Date().toISOString().split('T')[0],
        endDate: new Date().toISOString().split('T')[0],
        instances: {},
      });
      return;
    }

    const endDate = new Date();
    endDate.setHours(23, 59, 59, 999);
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysNum + 1);
    startDate.setHours(0, 0, 0, 0);

    const riResult = await pool.query(
      `
      SELECT ri.partition_date::text AS partition_date,
             ri.attempt,
             ri.start_time,
             ri.end_time,
             ri.status,
             ri.airflow_dag_id,
             ri.airflow_run_id,
             ri.airflow_task_id,
             ri.error_message,
             v.etl_task_id AS etl_task_id
      FROM etl_task_run_instances ri
      JOIN etl_task_versions v ON v.id = ri.etl_task_version_id
      WHERE v.etl_task_id = ANY($1::int[])
        AND ri.partition_date >= $2::date
        AND ri.partition_date <= $3::date
      ORDER BY ri.partition_date DESC, ri.attempt ASC
      `,
      [distinctTaskIds, startDate, endDate]
    );

    const grouped = new Map<string, Map<string, TaskInstance[]>>();

    const formatPartitionDateKey = (pd: unknown): string => {
      const utcDate = new Date(pd as string);
      const beijingDate = new Date(utcDate.getTime() + 8 * 60 * 60 * 1000);
      return beijingDate.toISOString().slice(0, 19).replace('T', ' ');
    };

    for (const row of riResult.rows) {
      const taskId = row.etl_task_id as number;
      const nodeIdsForTask = etlTaskToNodeIds.get(taskId);
      if (!nodeIdsForTask?.length) continue;

      const startRaw = row.start_time;
      const endRaw = row.end_time;
      const startBeijing = new Date(new Date(startRaw).getTime() + 8 * 60 * 60 * 1000);
      const endBeijing = endRaw
        ? new Date(new Date(endRaw).getTime() + 8 * 60 * 60 * 1000)
        : startBeijing;

      const formattedInst: TaskInstance = {
        partition_date: String(row.partition_date),
        attempt: row.attempt as number,
        start_time: startBeijing.toISOString().slice(0, 19).replace('T', ' '),
        end_time: endBeijing.toISOString().slice(0, 19).replace('T', ' '),
        status: String(row.status),
        airflow_dag_id: row.airflow_dag_id != null ? String(row.airflow_dag_id) : undefined,
        airflow_run_id: row.airflow_run_id != null ? String(row.airflow_run_id) : undefined,
        airflow_task_id: row.airflow_task_id != null ? String(row.airflow_task_id) : undefined,
        error_message: row.error_message != null ? String(row.error_message) : null,
      };

      const dateKey = formatPartitionDateKey(row.partition_date);

      for (const nid of nodeIdsForTask) {
        const meta = metaById.get(nid);
        if (!meta || !runMatchesNodeAirflow(meta, row.airflow_dag_id)) continue;
        if (!grouped.has(nid)) grouped.set(nid, new Map());
        const dateMap = grouped.get(nid)!;
        if (!dateMap.has(dateKey)) dateMap.set(dateKey, []);
        dateMap.get(dateKey)!.push(formattedInst);
      }
    }

    const instances: Record<string, Record<string, TaskInstance[]>> = {};
    grouped.forEach((dateMap, nid) => {
      instances[nid] = Object.fromEntries(dateMap);
    });

    res.json({
      rowKeys: orderedRowKeys,
      taskFiles: orderedRowKeys,
      startDate: startDate.toISOString().split('T')[0],
      endDate: endDate.toISOString().split('T')[0],
      instances,
    });
  } catch (error) {
    console.error('Error getting task instances:', error);
    res.status(500).json({ error: 'Failed to get task instances' });
  }
});

function topologicalSort(nodeIds: string[], dependencies: { source: string; target: string }[]): string[] {
  const inDegree = new Map<string, number>();
  const adjList = new Map<string, string[]>();
  nodeIds.forEach(node => {
    inDegree.set(node, 0);
    adjList.set(node, []);
  });
  dependencies.forEach(dep => {
    if (!adjList.has(dep.source) || !inDegree.has(dep.target)) return;
    adjList.get(dep.source)?.push(dep.target);
    inDegree.set(dep.target, (inDegree.get(dep.target) || 0) + 1);
  });
  const queue: string[] = [];
  inDegree.forEach((degree, node) => {
    if (degree === 0) queue.push(node);
  });
  const sorted: string[] = [];
  while (queue.length > 0) {
    const node = queue.shift()!;
    sorted.push(node);
    adjList.get(node)?.forEach(neighbor => {
      inDegree.set(neighbor, (inDegree.get(neighbor) || 0) - 1);
      if (inDegree.get(neighbor) === 0) queue.push(neighbor);
    });
  }
  return sorted.length > 0 ? sorted : [...nodeIds];
}

export default router;
