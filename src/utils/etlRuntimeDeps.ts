/**
 * 运行依赖：`runtime_deps_json` 为 `{ runtimeDependencies: Row[] }`，三层元数据 catalog → database → table。
 */

export interface EtlRuntimeDependencyRow {
  catalog: string;
  /** 中间层（catalog 与 table 之间，本产品字段名 database） */
  database: string;
  table: string;
  partition: string;
  secondaryPartitions: string;
}

export function emptyRuntimeDependencyRow(): EtlRuntimeDependencyRow {
  return {
    catalog: '',
    database: '',
    table: '',
    partition: '',
    secondaryPartitions: '',
  };
}

export function parseRuntimeDepsFromJsonText(text: string): EtlRuntimeDependencyRow[] {
  try {
    const parsed = JSON.parse(text || '{}') as unknown;
    if (!parsed || typeof parsed !== 'object') return [];
    const arr = (parsed as Record<string, unknown>).runtimeDependencies;
    if (!Array.isArray(arr)) return [];
    return arr.map((item): EtlRuntimeDependencyRow => {
      if (!item || typeof item !== 'object') return emptyRuntimeDependencyRow();
      const o = item as Record<string, unknown>;
      let secondaryPartitions = '';
      if (typeof o.secondaryPartitions === 'string') {
        secondaryPartitions = o.secondaryPartitions;
      } else if (Array.isArray(o.secondaryPartitions)) {
        secondaryPartitions = o.secondaryPartitions.filter(x => typeof x === 'string').join(',');
      }

      const catalog = typeof o.catalog === 'string' ? o.catalog : '';
      const database = typeof o.database === 'string' ? o.database : '';
      const table = typeof o.table === 'string' ? o.table : '';
      const schemaLegacy = typeof o.schema === 'string' ? o.schema : '';

      if (schemaLegacy && table) {
        const catRaw = catalog.trim() || database.trim();
        return {
          catalog: catRaw,
          database: schemaLegacy.trim(),
          table: table.trim(),
          partition: typeof o.partition === 'string' ? o.partition : '',
          secondaryPartitions,
        };
      }

      return {
        catalog: catalog.trim(),
        database: database.trim(),
        table: table.trim(),
        partition: typeof o.partition === 'string' ? o.partition : '',
        secondaryPartitions,
      };
    });
  } catch {
    return [];
  }
}

/** 将旧版合并画布用的 graph JSON 文本迁移为仅含 runtimeDependencies 的文本 */
export function migrateLegacyGraphJsonTextToRuntimeDeps(text: string): string {
  try {
    const o = JSON.parse(text || '{}') as Record<string, unknown>;
    const rd = o.runtimeDependencies;
    return JSON.stringify({ runtimeDependencies: Array.isArray(rd) ? rd : [] }, null, 2);
  } catch {
    return '{\n  "runtimeDependencies": []\n}';
  }
}

export function runtimeDepsToJsonText(rows: EtlRuntimeDependencyRow[]): string {
  const cleaned = rows
    .filter(r => r.catalog.trim() || r.database.trim() || r.table.trim())
    .map(r => ({
      catalog: r.catalog.trim(),
      database: r.database.trim(),
      table: r.table.trim(),
      partition: r.partition.trim(),
      secondaryPartitions: r.secondaryPartitions.trim(),
    }));
  return JSON.stringify({ runtimeDependencies: cleaned }, null, 2);
}

/** 单行简明展示：catalog.database.table */
export function formatRuntimeDepSummaryLine(r: EtlRuntimeDependencyRow): string {
  const c = r.catalog.trim();
  const d = r.database.trim();
  const t = r.table.trim();
  const qual = c || d || t ? [c, d, t].filter(Boolean).join('.') : '';
  const bits: string[] = [];
  if (qual) bits.push(qual);
  const p = r.partition.trim();
  if (p) bits.push(`分区 ${p}`);
  const sec = r.secondaryPartitions.trim();
  if (sec) bits.push(`二级 ${sec}`);
  return bits.join(' · ');
}

export function nonEmptyRuntimeDepRows(rows: EtlRuntimeDependencyRow[]): EtlRuntimeDependencyRow[] {
  return rows.filter(r => r.catalog.trim() || r.database.trim() || r.table.trim());
}

export function parseRuntimeDepsObjectFromJsonText(text: string): Record<string, unknown> {
  try {
    const o = JSON.parse(text || '{}') as unknown;
    if (o && typeof o === 'object' && !Array.isArray(o)) {
      return o as Record<string, unknown>;
    }
  } catch {
    /* invalid */
  }
  return { runtimeDependencies: [] };
}
