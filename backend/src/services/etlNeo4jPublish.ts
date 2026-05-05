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

function dedupeTriples(
  rows: Array<{ catalog_name: string; database_name: string; table_name: string }>
): Array<{ catalog_name: string; database_name: string; table_name: string }> {
  const seen = new Set<string>();
  const out: typeof rows = [];
  for (const r of rows) {
    const k = `${r.catalog_name}\0${r.database_name}\0${r.table_name}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(r);
  }
  return out;
}

/**
 * 发布成功后：按 catalog/database/table 复用已有 Table 节点（MERGE 仅三元组），写入产出与依赖边 (依赖)-[:MAKEUP]->(产出)。
 * 仅对「产出表」节点写入 etl_task_id、AIRFLOW_DAG_ID；依赖表节点不覆盖这两项，以免误标其它任务的产出。
 * 不再 DETACH DELETE 整节点；并收回本任务不再引用产出节点的 etl_task_id / AIRFLOW_DAG_ID。
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
      if (!out) {
        await tx.run(
          `
          MATCH (t:Table { etl_task_id: $eti })
          OPTIONAL MATCH ()-[rin:MAKEUP]->(t)
          DELETE rin
          OPTIONAL MATCH (t)-[rout:MAKEUP]->()
          DELETE rout
          REMOVE t.etl_task_id, t.AIRFLOW_DAG_ID
          `,
          { eti }
        );
        return;
      }

      const retainRows = dedupeTriples([out, ...deps]);

      await tx.run(
        `
        MATCH ()-[r:MAKEUP]->(o:Table)
        WHERE o.catalog_name = $cc AND o.database_name = $cdb AND o.table_name = $ct
        DELETE r
        `,
        { cc: out.catalog_name, cdb: out.database_name, ct: out.table_name }
      );

      await tx.run(
        `
        UNWIND $retain AS row
        WITH collect(DISTINCT row) AS retainRows
        MATCH (t:Table { etl_task_id: $eti })
        WHERE NOT ANY(
          row IN retainRows
          WHERE t.catalog_name = row.catalog_name
            AND t.database_name = row.database_name
            AND t.table_name = row.table_name
        )
        REMOVE t.etl_task_id, t.AIRFLOW_DAG_ID
        `,
        { eti, retain: retainRows }
      );

      await tx.run(
        `
        MERGE (o:Table { catalog_name: $cc, database_name: $cdb, table_name: $ct })
        SET o.catalog_type = $catalogType,
            o.etl_task_id = $eti,
            o.AIRFLOW_DAG_ID = $dagId
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

      const depRowsForEdges = deps.filter(
        d =>
          !(
            d.catalog_name === out.catalog_name &&
            d.database_name === out.database_name &&
            d.table_name === out.table_name
          )
      );

      for (const d of depRowsForEdges) {
        await tx.run(
          `
          MERGE (dep:Table { catalog_name: $dc, database_name: $ddb, table_name: $dt })
          SET dep.catalog_type = $catalogType
          WITH dep
          MATCH (o:Table { catalog_name: $oc, database_name: $odb, table_name: $ot })
          MERGE (dep)-[:MAKEUP]->(o)
          `,
          {
            dc: d.catalog_name,
            ddb: d.database_name,
            dt: d.table_name,
            catalogType: params.catalogType,
            oc: out.catalog_name,
            odb: out.database_name,
            ot: out.table_name,
          }
        );
      }

      if (depRowsForEdges.length > 0) {
        await tx.run(
          `
          UNWIND $deps AS row
          MATCH (t:Table)
          WHERE t.catalog_name = row.catalog_name
            AND t.database_name = row.database_name
            AND t.table_name = row.table_name
            AND t.etl_task_id = $eti
          REMOVE t.etl_task_id, t.AIRFLOW_DAG_ID
          `,
          {
            eti,
            deps: depRowsForEdges.map(d => ({
              catalog_name: d.catalog_name,
              database_name: d.database_name,
              table_name: d.table_name,
            })),
          }
        );
      }
    });
  } finally {
    await session.close();
  }
}
