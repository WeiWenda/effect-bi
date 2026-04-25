import { Router, Request, Response } from 'express';
import { pool } from '../config/postgres.js';
import { getSession } from '../config/neo4j.js';

const router: Router = Router();

interface TaskInstance {
  task_file: string;
  partition_date: string;
  attempt: number;
  start_time: string;
  end_time: string;
  status: string;
}

/**
 * Get task instances for a DAG view
 * GET /api/task/dag/:dagId?days=7
 */
router.get('/dag/:dagId', async (req: Request, res: Response): Promise<void> => {
  try {
    const { dagId } = req.params;
    const { days = '7' } = req.query;

    const dagIdStr = Array.isArray(dagId) ? dagId[0] : dagId;
    const daysNum = parseInt(days as string);

    if (!dagIdStr || isNaN(parseInt(dagIdStr))) {
      res.status(400).json({ error: 'Valid DAG ID is required' });
      return;
    }

    // Fetch DAG view to get node IDs
    const pgClient = await pool.connect();
    let nodeIds: string[];
    try {
      const pgQuery = `
        SELECT node_ids
        FROM dag_views
        WHERE id = $1
      `;
      const pgResult = await pgClient.query(pgQuery, [dagIdStr]);

      if (pgResult.rows.length === 0) {
        res.status(404).json({ error: 'DAG view not found' });
        return;
      }

      nodeIds = pgResult.rows[0].node_ids;
    } finally {
      pgClient.release();
    }

    // Fetch dependencies and task_file mapping from Neo4j
    const session = getSession();
    const dependencies: { source: string; target: string }[] = [];
    const nodeIdToTaskFile = new Map<string, string>();
    try {
      const nodeIdsString = nodeIds.map((id: string) => `'${id}'`).join(', ');
      const query = `
        MATCH (a:HiveTable)-[r]->(b:HiveTable)
        WHERE elementId(a) IN [${nodeIdsString}] AND elementId(b) IN [${nodeIdsString}]
        RETURN elementId(a) as source, elementId(b) as target, a.task_file as source_task_file, b.task_file as target_task_file
      `;
      const result = await session.run(query);
      result.records.forEach((record: any) => {
        const source = record.get('source');
        const target = record.get('target');
        const sourceTaskFile = record.get('source_task_file');
        const targetTaskFile = record.get('target_task_file');

        dependencies.push({ source, target });
        if (sourceTaskFile) nodeIdToTaskFile.set(source, sourceTaskFile);
        if (targetTaskFile) nodeIdToTaskFile.set(target, targetTaskFile);
      });

      // Also fetch task_file for nodes without dependencies
      const nodeQuery = `
        MATCH (n:HiveTable)
        WHERE elementId(n) IN [${nodeIdsString}]
        RETURN elementId(n) as id, n.task_file as task_file
      `;
      const nodeResult = await session.run(nodeQuery);
      nodeResult.records.forEach((record: any) => {
        const id = record.get('id');
        const taskFile = record.get('task_file');
        if (taskFile) nodeIdToTaskFile.set(id, taskFile);
      });
    } finally {
      await session.close();
    }

    // Topological sort to get execution order
    const inDegree = new Map<string, number>();
    const adjList = new Map<string, string[]>();

    nodeIds.forEach(node => {
      inDegree.set(node, 0);
      adjList.set(node, []);
    });

    dependencies.forEach(dep => {
      adjList.get(dep.source)?.push(dep.target);
      inDegree.set(dep.target, (inDegree.get(dep.target) || 0) + 1);
    });

    const queue: string[] = [];
    inDegree.forEach((degree, node) => {
      if (degree === 0) queue.push(node);
    });

    const sortedNodeIds: string[] = [];
    while (queue.length > 0) {
      const node = queue.shift()!;
      sortedNodeIds.push(node);

      adjList.get(node)?.forEach(neighbor => {
        inDegree.set(neighbor, (inDegree.get(neighbor) || 0) - 1);
        if (inDegree.get(neighbor) === 0) {
          queue.push(neighbor);
        }
      });
    }

    // Use topologically sorted order and convert to task files
    const orderedNodeIds = sortedNodeIds;
    const orderedTaskFiles = orderedNodeIds
      .map(nodeId => nodeIdToTaskFile.get(nodeId))
      .filter((file): file is string => file !== undefined);

    // Fetch task instances for the date range, filtered to only include DAG's task files
    // Include today, show past N days including today
    const endDate = new Date();
    endDate.setHours(23, 59, 59, 999); // Today 23:59:59
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysNum + 1);
    startDate.setHours(0, 0, 0, 0);

    const query = `
      SELECT task_file, partition_date, attempt, start_time, end_time, status
      FROM task_instances
      WHERE partition_date >= $1 AND partition_date <= $2
        AND task_file = ANY($3)
      ORDER BY partition_date DESC, task_file, attempt
    `;

    const result = await pool.query(query, [startDate, endDate, orderedTaskFiles]);
    const instances: TaskInstance[] = result.rows;

    // Group by task_file and partition_date
    const grouped = new Map<string, Map<string, TaskInstance[]>>();
    instances.forEach(inst => {
      // Convert UTC to Beijing time (UTC+8) and format to yyyy-MM-dd HH:mm:ss
      const utcDate = new Date(inst.partition_date);
      const beijingDate = new Date(utcDate.getTime() + 8 * 60 * 60 * 1000);
      const formattedDate = beijingDate.toISOString().slice(0, 19).replace('T', ' ');
      
      // Format times to Beijing time
      const startBeijing = new Date(new Date(inst.start_time).getTime() + 8 * 60 * 60 * 1000);
      const endBeijing = new Date(new Date(inst.end_time).getTime() + 8 * 60 * 60 * 1000);
      
      const formattedInst: TaskInstance = {
        ...inst,
        start_time: startBeijing.toISOString().slice(0, 19).replace('T', ' '),
        end_time: endBeijing.toISOString().slice(0, 19).replace('T', ' '),
      };
      
      if (!grouped.has(inst.task_file)) {
        grouped.set(inst.task_file, new Map());
      }
      const dateMap = grouped.get(inst.task_file)!;
      if (!dateMap.has(formattedDate)) {
        dateMap.set(formattedDate, []);
      }
      dateMap.get(formattedDate)!.push(formattedInst);
    });

    // Build response with task files in topological order
    const response = {
      taskFiles: orderedTaskFiles,
      startDate: startDate.toISOString().split('T')[0],
      endDate: endDate.toISOString().split('T')[0],
      instances: Object.fromEntries(
        Array.from(grouped.entries()).map(([taskFile, dateMap]) => [
          taskFile,
          Object.fromEntries(dateMap),
        ])
      ),
    };

    res.json(response);
  } catch (error) {
    console.error('Error getting task instances:', error);
    res.status(500).json({ error: 'Failed to get task instances' });
  }
});

export default router;
