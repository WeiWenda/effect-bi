import { getSession } from '../src/config/neo4j.js';
import { pool } from '../src/config/postgres.js';
import dotenv from 'dotenv';

dotenv.config();

interface HiveTable {
  id: string;
  table_name: string;
  task_file?: string;
}

interface Dependency {
  source: string;
  target: string;
}

interface TaskInstance {
  task_file: string;
  partition_date: Date;
  attempt: number;
  start_time: Date;
  end_time: Date;
  status: 'success' | 'failed' | 'running';
}

// Random duration between 30min and 1h30min in milliseconds
function getRandomDuration(): number {
  const min = 30 * 60 * 1000; // 30 minutes
  const max = 90 * 60 * 1000; // 1h30min
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Format date to YYYY-MM-DD
function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

// Get all HiveTable nodes from Neo4j
async function getHiveTables(): Promise<HiveTable[]> {
  const session = getSession();
  const query = `
    MATCH (n:HiveTable)
    RETURN n
  `;
  
  const result = await session.run(query);
  const tables: HiveTable[] = result.records.map((record: any) => {
    const node = record.get('n');
    return {
      id: node.elementId,
      table_name: node.properties.table_name || node.properties.name || 'unknown',
      task_file: node.properties.task_file || node.properties.taskFile,
    };
  });
  
  await session.close();
  return tables;
}

// Get dependencies between tables
async function getDependencies(): Promise<Dependency[]> {
  const session = getSession();
  const query = `
    MATCH (a:HiveTable)-[r]->(b:HiveTable)
    RETURN elementId(a) as source, elementId(b) as target
  `;
  
  const result = await session.run(query);
  const dependencies: Dependency[] = result.records.map((record: any) => ({
    source: record.get('source'),
    target: record.get('target'),
  }));
  
  await session.close();
  return dependencies;
}

// Topological sort to get execution order
function topologicalSort(nodes: string[], dependencies: Dependency[]): string[] {
  const inDegree = new Map<string, number>();
  const adjList = new Map<string, string[]>();
  
  // Initialize
  nodes.forEach(node => {
    inDegree.set(node, 0);
    adjList.set(node, []);
  });
  
  // Build graph
  dependencies.forEach(dep => {
    adjList.get(dep.source)?.push(dep.target);
    inDegree.set(dep.target, (inDegree.get(dep.target) || 0) + 1);
  });
  
  // Kahn's algorithm
  const queue: string[] = [];
  inDegree.forEach((degree, node) => {
    if (degree === 0) queue.push(node);
  });
  
  const result: string[] = [];
  while (queue.length > 0) {
    const node = queue.shift()!;
    result.push(node);
    
    adjList.get(node)?.forEach(neighbor => {
      inDegree.set(neighbor, (inDegree.get(neighbor) || 0) - 1);
      if (inDegree.get(neighbor) === 0) {
        queue.push(neighbor);
      }
    });
  }
  
  return result;
}

// Generate task instances for a single day
async function generateDayInstances(
  tables: HiveTable[],
  dependencies: Dependency[],
  executionOrder: string[],
  date: Date
): Promise<TaskInstance[]> {
  const instances: TaskInstance[] = [];
  const tableMap = new Map(tables.map(t => [t.id, t]));
  const nodeEndTime = new Map<string, Date>(); // Track end time for each node
  
  // Base start time: 0:10 of the day
  const baseDate = new Date(date);
  baseDate.setHours(0, 10, 0, 0);
  
  for (const nodeId of executionOrder) {
    const table = tableMap.get(nodeId);
    if (!table || !table.task_file) continue;
    
    // Calculate start time based on dependencies
    let startTime = new Date(baseDate);
    const incomingDeps = dependencies.filter(d => d.target === nodeId);
    
    if (incomingDeps.length > 0) {
      // Start time = max(upstream end times) + 2min
      const maxEndTime = incomingDeps.reduce((max, dep) => {
        const depEndTime = nodeEndTime.get(dep.source);
        return depEndTime && depEndTime > max ? depEndTime : max;
      }, new Date(baseDate));
      startTime = new Date(maxEndTime.getTime() + 2 * 60 * 1000); // +2min
    }
    
    // Simulate execution with possible failures
    let attempt = 1;
    let currentStartTime = new Date(startTime);
    let success = false;
    
    while (!success) {
      const duration = getRandomDuration();
      const endTime = new Date(currentStartTime.getTime() + duration);
      
      // 1/10 probability of failure
      const failed = Math.random() < 0.1;
      
      instances.push({
        task_file: table.task_file,
        partition_date: date,
        attempt,
        start_time: currentStartTime,
        end_time: endTime,
        status: failed ? 'failed' : 'success',
      });
      
      if (failed) {
        // Retry: start time = previous end time + 2min
        currentStartTime = new Date(endTime.getTime() + 2 * 60 * 1000);
        attempt++;
      } else {
        success = true;
        nodeEndTime.set(nodeId, endTime);
      }
    }
  }
  
  return instances;
}

// Insert task instances into PostgreSQL
async function insertTaskInstances(instances: TaskInstance[]): Promise<void> {
  const client = await pool.connect();
  try {
    for (const instance of instances) {
      const query = `
        INSERT INTO task_instances (task_file, partition_date, attempt, start_time, end_time, status)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (task_file, partition_date, attempt) DO UPDATE SET
          start_time = EXCLUDED.start_time,
          end_time = EXCLUDED.end_time,
          status = EXCLUDED.status
      `;
      await client.query(query, [
        instance.task_file,
        instance.partition_date,
        instance.attempt,
        instance.start_time,
        instance.end_time,
        instance.status,
      ]);
    }
  } finally {
    client.release();
  }
}

async function main() {
  console.log('Fetching HiveTable nodes from Neo4j...');
  const tables = await getHiveTables();
  console.log(`Found ${tables.length} tables`);
  
  console.log('Fetching dependencies...');
  const dependencies = await getDependencies();
  console.log(`Found ${dependencies.length} dependencies`);
  
  console.log('Calculating execution order...');
  const nodeIds = tables.map(t => t.id);
  const executionOrder = topologicalSort(nodeIds, dependencies);
  console.log(`Execution order: ${executionOrder.length} nodes`);
  
  // Generate data for past 7 days
  const today = new Date();
  const instances: TaskInstance[] = [];
  
  for (let i = 6; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    date.setHours(0, 0, 0, 0);
    
    console.log(`Generating instances for ${formatDate(date)}...`);
    const dayInstances = await generateDayInstances(
      tables,
      dependencies,
      executionOrder,
      date
    );
    instances.push(...dayInstances);
    console.log(`Generated ${dayInstances.length} instances for ${formatDate(date)}`);
  }
  
  console.log(`Total instances to insert: ${instances.length}`);
  
  console.log('Inserting into PostgreSQL...');
  await insertTaskInstances(instances);
  console.log('Mock data generation completed!');
  
  await pool.end();
}

main().catch(console.error);
