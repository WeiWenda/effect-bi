import neo4j from 'neo4j-driver';
import { getSession } from '../config/neo4j.js';
import { defaultCatalog } from './etlOutputTable.js';

export function defaultCatalogType(): string {
  return (process.env.DEFAULT_ETL_CATALOG_TYPE || 'hive').trim() || 'hive';
}

function normalizeDepRow(item: unknown): {
  catalog_name: string;
  database_name: string;
  table_name: string;
} | null {
  if (!item || typeof item !== 'object') return null;
  const o = item as Record<string, unknown>;
  const catalog = typeof o.catalog === 'string' ? o.catalog.trim() : '';
  const database = typeof o.database === 'string' ? o.database.trim() : '';
  const table = typeof o.table === 'string' ? o.table.trim() : '';
  const schemaLegacy = typeof o.schema === 'string' ? o.schema.trim() : '';

  if (schemaLegacy && table) {
    const catRaw = catalog || database;
    if (!catRaw) return null;
    return {
      catalog_name: catRaw || defaultCatalog(),
      database_name: schemaLegacy,
      table_name: table,
    };
  }

  if (!database || !table) return null;
  return {
    catalog_name: catalog || defaultCatalog(),
    database_name: database,
    table_name: table,
  };
}

export function parseRuntimeDepsForNeo(runtimeDepsJson: unknown): Array<{
  catalog_name: string;
  database_name: string;
  table_name: string;
}> {
  if (!runtimeDepsJson || typeof runtimeDepsJson !== 'object') return [];
  const rd = (runtimeDepsJson as Record<string, unknown>).runtimeDependencies;
  if (!Array.isArray(rd)) return [];
  const out: Array<{ catalog_name: string; database_name: string; table_name: string }> = [];
  for (const item of rd) {
    const row = normalizeDepRow(item);
    if (row) out.push(row);
  }
  return out;
}

export function resolveOutputTableFromTaskInfoOnly(info: {
  catalog_name: string | null;
  database_name: string | null;
  table_name: string | null;
}): { catalog_name: string; database_name: string; table_name: string } | null {
  const d = (info.database_name || '').trim();
  const t = (info.table_name || '').trim();
  if (!d || !t) return null;
  const c = (info.catalog_name || '').trim();
  return {
    catalog_name: c || defaultCatalog(),
    database_name: d,
    table_name: t,
  };
}

/**
 * 发布成功后：清理该 ETL 任务旧的 Table 节点，写入产出表与运行依赖表，(依赖)-[:MAKEUP]->(产出)
 */
export async function syncEtlPublishToNeo4j(params: {
  etlTaskId: number;
  airflowDagId: string;
  catalogType: string;
  runtimeDepsJson: unknown;
  etlTaskInfo: {
    catalog_name: string | null;
    database_name: string | null;
    table_name: string | null;
  };
}): Promise<void> {
  const out = resolveOutputTableFromTaskInfoOnly(params.etlTaskInfo);
  const deps = parseRuntimeDepsForNeo(params.runtimeDepsJson);
  const session = getSession();
  const eti = neo4j.int(params.etlTaskId);
  try {
    await session.executeWrite(async tx => {
      await tx.run(`MATCH (t:Table { etl_task_id: $eti }) DETACH DELETE t`, { eti });
      if (!out) {
        return;
      }
      await tx.run(
        `
        MERGE (o:Table {
          AIRFLOW_DAG_ID: $dagId,
          catalog_name: $cc,
          database_name: $cdb,
          table_name: $ct
        })
        SET o.catalog_type = $catalogType,
            o.etl_task_id = $eti
        `,
        {
          dagId: params.airflowDagId,
          cc: out.catalog_name,
          cdb: out.database_name,
          ct: out.table_name,
          catalogType: params.catalogType,
          eti,
        }
      );

      for (const d of deps) {
        if (
          d.catalog_name === out.catalog_name &&
          d.database_name === out.database_name &&
          d.table_name === out.table_name
        ) {
          continue;
        }
        await tx.run(
          `
          MERGE (dep:Table {
            AIRFLOW_DAG_ID: $dagId,
            catalog_name: $dc,
            database_name: $ddb,
            table_name: $dt
          })
          SET dep.catalog_type = $catalogType,
              dep.etl_task_id = $eti
          WITH dep
          MATCH (o:Table {
            AIRFLOW_DAG_ID: $dagId,
            catalog_name: $oc,
            database_name: $odb,
            table_name: $ot
          })
          MERGE (dep)-[:MAKEUP]->(o)
          `,
          {
            dagId: params.airflowDagId,
            dc: d.catalog_name,
            ddb: d.database_name,
            dt: d.table_name,
            catalogType: params.catalogType,
            eti,
            oc: out.catalog_name,
            odb: out.database_name,
            ot: out.table_name,
          }
        );
      }
    });
  } finally {
    await session.close();
  }
}
