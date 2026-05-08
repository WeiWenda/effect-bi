/** Neo4j `:Table` nodes from ETL publish — properties vs legacy HiveTable meta */

export function lineageTableDisplayName(properties: Record<string, unknown>): string {
  const name = typeof properties.name === 'string' ? properties.name.trim() : '';
  if (name) return name;
  const tn = typeof properties.table_name === 'string' ? properties.table_name.trim() : '';
  const c = typeof properties.catalog_name === 'string' ? properties.catalog_name.trim() : '';
  const d = typeof properties.database_name === 'string' ? properties.database_name.trim() : '';
  if (c && d && tn) return `${c}.${d}.${tn}`;
  if (d && tn) return `${d}.${tn}`;
  if (tn) return tn;
  return 'Unknown';
}

export function lineageTableLayer(properties: Record<string, unknown>): string {
  const ct = typeof properties.catalog_type === 'string' ? properties.catalog_type.trim() : '';
  if (ct) return ct;
  const layer = typeof properties.layer === 'string' ? properties.layer.trim() : '';
  if (layer) return layer;
  const tier = typeof properties.tier === 'string' ? properties.tier.trim() : '';
  if (tier) return tier;
  const cat = typeof properties.catalog_name === 'string' ? properties.catalog_name.trim() : '';
  if (cat) return cat;
  return 'ETL';
}

/** 与 GET /lineage/entity?tableName= 对齐；优先裸 `table_name` */
export function lineageEntityRouteTableName(properties: Record<string, unknown>): string {
  const raw = typeof properties.table_name === 'string' ? properties.table_name.trim() : '';
  if (raw) return raw;
  return lineageTableDisplayName(properties);
}

/** Gravitino / 产出明细共用：catalog → database(schema) → table */
/** Neo4j 表节点上的 `etl_task_id`，与 `etl_task_info.id` 一致（发布后写入）。 */
export function lineageEtlTaskInfoId(properties: Record<string, unknown>): number | null {
  const raw = properties.etl_task_id;
  if (typeof raw === 'number' && Number.isFinite(raw)) return Math.floor(raw);
  if (typeof raw === 'string') {
    const n = parseInt(raw.trim(), 10);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export function lineageTableGravitinoLocation(
  properties: Record<string, unknown>
): { catalog: string; database: string; table: string } | null {
  const catalog = typeof properties.catalog_name === 'string' ? properties.catalog_name.trim() : '';
  const database = typeof properties.database_name === 'string' ? properties.database_name.trim() : '';
  const table = typeof properties.table_name === 'string' ? properties.table_name.trim() : '';
  if (catalog && database && table) {
    return { catalog, database, table };
  }
  return null;
}

export function lineageTableDescription(properties: Record<string, unknown>): string {
  const desc = typeof properties.description === 'string' ? properties.description.trim() : '';
  if (desc) return desc;
  const comment = typeof properties.comment === 'string' ? properties.comment.trim() : '';
  if (comment) return comment;
  const c = typeof properties.catalog_name === 'string' ? properties.catalog_name.trim() : '';
  const d = typeof properties.database_name === 'string' ? properties.database_name.trim() : '';
  if (c && d) return `${c} / ${d}`;
  const dag = typeof properties.AIRFLOW_DAG_ID === 'string' ? properties.AIRFLOW_DAG_ID.trim() : '';
  if (dag) return `DAG: ${dag}`;
  return '';
}
