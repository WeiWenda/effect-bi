/**
 * 临时脚本：清空 Neo4j 中所有 MAKEUP 关系与 :Table 节点（血缘 ETL 同步数据）。
 *
 * Run from backend/:  npx tsx scripts/clear-neo4j-tables.ts
 * 仅统计不删除： DRY_RUN=1 npx tsx scripts/clear-neo4j-tables.ts
 */
import dotenv from 'dotenv';
import { closeDriver, getSession } from '../src/config/neo4j.js';

dotenv.config();

/** neo4j-driver 不同版本对 statistics 可能是属性或方法 */
function statNum(u: unknown, key: 'relationshipsDeleted' | 'nodesDeleted'): number {
  if (u == null || typeof u !== 'object') return 0;
  const v = (u as Record<string, unknown>)[key];
  if (typeof v === 'function') return (v as () => number)();
  if (typeof v === 'number') return v;
  return 0;
}

async function main(): Promise<void> {
  const dry = process.env.DRY_RUN === '1';
  const session = getSession();

  try {
    if (dry) {
      const e = await session.run(`MATCH ()-[r:MAKEUP]->() RETURN count(r) AS c`);
      const n = await session.run(`MATCH (t:Table) RETURN count(t) AS c`);
      const edges = e.records[0]?.get('c');
      const nodes = n.records[0]?.get('c');
      console.log(`DRY_RUN: MAKEUP=${edges}, Table=${nodes}`);
      return;
    }

    const result = await session.executeWrite(tx =>
      tx.run(
        `
        MATCH ()-[r:MAKEUP]->()
        DELETE r
        WITH 1 AS _
        MATCH (t:Table)
        DETACH DELETE t
        `
      )
    );

    const counters = result.summary.counters.updates();
    const rel = statNum(counters, 'relationshipsDeleted');
    const nodes = statNum(counters, 'nodesDeleted');
    console.log(`Done. relationshipsDeleted=${rel}, nodesDeleted=${nodes}`);
  } finally {
    await session.close();
    await closeDriver();
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
