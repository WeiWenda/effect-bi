/** 产出表：catalog → database（中间层）→ table */
export interface EtlOutputTable {
  catalog?: string;
  database: string;
  table: string;
}

/** 产出表仅来自 etl_task_info 三元组 */
export function parseOutputTableFromTaskInfo(info: {
  catalog_name?: string | null;
  database_name?: string | null;
  table_name?: string | null;
}): EtlOutputTable | null {
  const database = typeof info.database_name === 'string' ? info.database_name.trim() : '';
  const table = typeof info.table_name === 'string' ? info.table_name.trim() : '';
  if (!database || !table) return null;
  const catRaw = typeof info.catalog_name === 'string' ? info.catalog_name.trim() : '';
  return {
    catalog: catRaw || undefined,
    database,
    table,
  };
}

export function defaultCatalog(): string {
  return (process.env.DEFAULT_ETL_CATALOG || 'hive').trim() || 'hive';
}
