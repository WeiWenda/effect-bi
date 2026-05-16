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

/** ReactFlow 节点主标题：仅表名；catalog/database 由 description 行展示 */
export function lineageTableNodeLabel(properties: Record<string, unknown>): string {
  const tn = typeof properties.table_name === 'string' ? properties.table_name.trim() : '';
  if (tn) return tn;
  return lineageTableDisplayName(properties);
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

const DATAWORKS_MC_BASE =
  'https://dataworks.data.aliyun.com/cn-shanghai/dmc/data-catalog';

function lineagePropString(properties: Record<string, unknown>, key: string): string {
  const v = properties[key];
  return typeof v === 'string' ? v.trim() : '';
}

/** Neo4j 任务节点上的相对路径，供 GET /api/file/task 读取 TASK_HOME 下文件 */
export function lineageNodeFilePath(properties: Record<string, unknown>): string | undefined {
  for (const key of ['file_path', 'filePath', 'task_file', 'taskFile'] as const) {
    const v = lineagePropString(properties, key);
    if (v) return v;
  }
  return undefined;
}

/** Neo4j `catalog_type` 为 maxcompute（不区分大小写） */
export function lineageIsMaxComputeTable(properties: Record<string, unknown>): boolean {
  return lineagePropString(properties, 'catalog_type').toLowerCase() === 'maxcompute';
}

/** Neo4j 节点上的 DataWorks `nodeKey`（与控制台复制一致，如 maxcompute-table:::项目:::表） */
export function lineageAliyunTableId(properties: Record<string, unknown>): string {
  const raw = properties.ALIYUN_TABLE_ID ?? properties.aliyun_table_id;
  return typeof raw === 'string' ? raw.trim() : '';
}

/**
 * MaxCompute 表在 DataWorks 数据地图中的直达链接。
 * `nodeKey` 直接使用 Neo4j 属性 `ALIYUN_TABLE_ID`，不再拼接 catalog/database。
 */
export function lineageMaxComputeDataWorksUrl(properties: Record<string, unknown>): string | null {
  if (!lineageIsMaxComputeTable(properties)) return null;
  const nodeKey = lineageAliyunTableId(properties);
  if (!nodeKey) return null;
  const params = new URLSearchParams();
  params.set('treeViewType', 'maxcompute');
  params.set('nodeKey', nodeKey);
  params.set('nodeCategory', 'TABLE');
  return `${DATAWORKS_MC_BASE}?${params.toString()}`;
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
