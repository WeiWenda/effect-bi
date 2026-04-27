import { getSession } from '../src/config/neo4j.js';
import { pool } from '../src/config/postgres.js';
import dotenv from 'dotenv';

dotenv.config();

interface HiveTableNode {
  elementId: string;
  table_name: string;
  task_file?: string;
  layer?: string;
  description?: string;
}

async function getHiveTables(): Promise<HiveTableNode[]> {
  const session = getSession();
  const query = `
    MATCH (n:HiveTable)
    RETURN n
  `;

  const result = await session.run(query);
  const tables: HiveTableNode[] = result.records.map((record: any) => {
    const node = record.get('n');
    return {
      elementId: node.elementId,
      table_name: node.properties.table_name || node.properties.name || 'unknown',
      task_file: node.properties.task_file || node.properties.taskFile || null,
      layer: node.properties.layer || node.properties.tier || null,
      description: node.properties.description || node.properties.comment || null,
    };
  });

  await session.close();
  return tables;
}

async function insertTaskInfo(tables: HiveTableNode[]): Promise<void> {
  const client = await pool.connect();
  try {
    for (const table of tables) {
      const query = `
        INSERT INTO task_info (neo4j_node_id, task_file, table_name, layer, description)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (neo4j_node_id) DO UPDATE SET
          task_file = EXCLUDED.task_file,
          table_name = EXCLUDED.table_name,
          layer = EXCLUDED.layer,
          description = EXCLUDED.description
      `;
      await client.query(query, [
        table.elementId,
        table.task_file,
        table.table_name,
        table.layer,
        table.description,
      ]);
    }
  } finally {
    client.release();
  }
}

async function main() {
  console.log('Fetching HiveTable nodes from Neo4j...');
  const tables = await getHiveTables();
  console.log(`Found ${tables.length} HiveTable nodes`);

  console.log('Inserting into PostgreSQL task_info...');
  await insertTaskInfo(tables);
  console.log('Initial task_info data completed!');

  await pool.end();
}

main().catch(console.error);
