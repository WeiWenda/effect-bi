/** 质检规则（存入 quality_rules_json） */

export const QUALITY_RULE_OPERATORS = ['gt', 'lt', 'eq', 'gte', 'lte'] as const;
export type QualityRuleOperator = (typeof QUALITY_RULE_OPERATORS)[number];

export const QUALITY_RULE_OPERATOR_LABELS: Record<QualityRuleOperator, string> = {
  gt: '大于',
  lt: '小于',
  eq: '等于',
  gte: '大于等于',
  lte: '小于等于',
};

export interface EtlQualityRuleTriple {
  /** 基于 result1/result2… 的 JS 表达式，如 result1.map(x=>x.id).filter(Boolean).length */
  expression: string;
  operator: QualityRuleOperator;
  /** 整数或小数 */
  value: number;
}

export interface EtlQualityRulesBundle {
  sqlQueries: string[];
  rules: EtlQualityRuleTriple[];
}

export function defaultQualityRulesBundle(): EtlQualityRulesBundle {
  return { sqlQueries: [''], rules: [] };
}

function isOperator(x: unknown): x is QualityRuleOperator {
  return typeof x === 'string' && (QUALITY_RULE_OPERATORS as readonly string[]).includes(x);
}

function normalizeRule(o: unknown): EtlQualityRuleTriple | null {
  if (!o || typeof o !== 'object') return null;
  const r = o as Record<string, unknown>;
  const expression = typeof r.expression === 'string' ? r.expression : '';
  const operator = isOperator(r.operator) ? r.operator : 'eq';
  const rawVal = r.value;
  const value =
    typeof rawVal === 'number' && Number.isFinite(rawVal)
      ? rawVal
      : typeof rawVal === 'string' && rawVal.trim() !== ''
        ? Number.parseFloat(rawVal)
        : NaN;
  if (!Number.isFinite(value)) return null;
  return { expression, operator, value };
}

export function parseQualityRulesFromJsonText(text: string): EtlQualityRulesBundle {
  try {
    const p = JSON.parse(text || '{}') as unknown;
    if (Array.isArray(p)) {
      return defaultQualityRulesBundle();
    }
    if (!p || typeof p !== 'object') {
      return defaultQualityRulesBundle();
    }
    const obj = p as Record<string, unknown>;
    const sqlRaw = obj.sqlQueries;
    const rulesRaw = obj.rules;
    const sqlQueries =
      Array.isArray(sqlRaw) && sqlRaw.every(x => typeof x === 'string')
        ? sqlRaw.length > 0
          ? [...sqlRaw]
          : ['']
        : [''];
    const rules: EtlQualityRuleTriple[] = [];
    if (Array.isArray(rulesRaw)) {
      for (const item of rulesRaw) {
        const nr = normalizeRule(item);
        if (nr) rules.push(nr);
      }
    }
    return { sqlQueries, rules };
  } catch {
    return defaultQualityRulesBundle();
  }
}

/** 是否为旧版「JSON 数组」配置（不含 sqlQueries/rules 对象） */
export function qualityRulesIsLegacyJsonArray(text: string): boolean {
  try {
    const p = JSON.parse(text || '[]') as unknown;
    return Array.isArray(p);
  } catch {
    return false;
  }
}

export function qualityRulesBundleToJsonText(bundle: EtlQualityRulesBundle): string {
  const sqlQueries = bundle.sqlQueries.map(s => s.trim()).filter(s => s.length > 0);
  const rules: EtlQualityRuleTriple[] = [];
  for (const r of bundle.rules) {
    const expr = r.expression.trim();
    if (!expr) continue;
    if (!Number.isFinite(r.value)) continue;
    rules.push({
      expression: expr,
      operator: r.operator,
      value: r.value,
    });
  }
  return JSON.stringify({ sqlQueries, rules });
}

export function formatQualityRulesSummary(bundle: EtlQualityRulesBundle): string[] {
  const lines: string[] = [];
  const nSql = bundle.sqlQueries.filter(s => s.trim()).length;
  if (nSql > 0) {
    lines.push(`${nSql} 条质检 SQL`);
  }
  bundle.rules.forEach((r, i) => {
    const op = QUALITY_RULE_OPERATOR_LABELS[r.operator] ?? r.operator;
    const ex =
      r.expression.length > 42 ? `${r.expression.slice(0, 40)}…` : r.expression;
    lines.push(`规则 ${i + 1}：${ex} ${op} ${r.value}`);
  });
  return lines;
}
