import { getSession } from '../config/neo4j.js';

/**
 * 判断 Neo4j 中是否存在「由本系统发布的 ETL」作为产出表的 Table 节点。
 *
 * 发布同步 `(dep:Table)-[:MAKEUP]->(o:Table)`：产出节点 o 要么有来自依赖的入边，要么无依赖时无任何 MAKEUP 边；
 * 纯依赖节点 dep 恒有指向产出的出边。
 *
 * 若不存在此类产出节点且三元组曾在图中仅作为上游依赖出现，则不会有 PG 分区成功登记，
 * 按旧逻辑 isPartitionReady 会永远为 false，Airflow 会卡在 check 轮询。
 */
export async function neo4jHasManagedProducerForTable(
  catalog: string,
  database: string,
  table: string
): Promise<boolean> {
  const session = getSession();
  try {
    const result = await session.run(
      `
      MATCH (t:Table)
      WHERE t.catalog_name = $catalog
        AND t.database_name = $database
        AND t.table_name = $table
        AND ((t)<-[:MAKEUP]-() OR NOT (t)-[:MAKEUP]->())
      RETURN count(t) >= 1 AS has_producer
      `,
      { catalog, database, table }
    );
    const rec = result.records[0];
    if (!rec) return false;
    return rec.get('has_producer') === true;
  } finally {
    await session.close();
  }
}
