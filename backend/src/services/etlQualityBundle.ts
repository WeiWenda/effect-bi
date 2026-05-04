import type { QueryRunResult } from './sqlQueryRunner.js';

export interface QualityRuleTriple {
  expression: string;
  operator: 'gt' | 'lt' | 'eq' | 'gte' | 'lte';
  value: number;
}

export interface QualityRulesBundle {
  sqlQueries: string[];
  rules: QualityRuleTriple[];
}

export function parseQualityRulesBundle(json: unknown): QualityRulesBundle {
  if (!json || typeof json !== 'object') {
    return { sqlQueries: [], rules: [] };
  }
  const obj = json as Record<string, unknown>;
  const sqlRaw = obj.sqlQueries;
  const rulesRaw = obj.rules;
  const sqlQueries =
    Array.isArray(sqlRaw) && sqlRaw.every(x => typeof x === 'string')
      ? sqlRaw.map(s => String(s))
      : [];
  const rules: QualityRuleTriple[] = [];
  if (Array.isArray(rulesRaw)) {
    for (const item of rulesRaw) {
      if (!item || typeof item !== 'object') continue;
      const r = item as Record<string, unknown>;
      const expression = typeof r.expression === 'string' ? r.expression : '';
      const op = r.operator;
      const operator =
        op === 'gt' || op === 'lt' || op === 'eq' || op === 'gte' || op === 'lte' ? op : 'eq';
      const rawVal = r.value;
      const value =
        typeof rawVal === 'number' && Number.isFinite(rawVal)
          ? rawVal
          : typeof rawVal === 'string' && rawVal.trim() !== ''
            ? Number.parseFloat(rawVal)
            : NaN;
      if (!expression.trim() || !Number.isFinite(value)) continue;
      rules.push({ expression, operator, value });
    }
  }
  return { sqlQueries, rules };
}

export function hasExecutableQuality(bundle: QualityRulesBundle): boolean {
  const hasSql = bundle.sqlQueries.some(s => s.trim().length > 0);
  return hasSql && bundle.rules.length > 0;
}

function compareOp(a: number, b: number, op: QualityRuleTriple['operator']): boolean {
  switch (op) {
    case 'gt':
      return a > b;
    case 'gte':
      return a >= b;
    case 'lt':
      return a < b;
    case 'lte':
      return a <= b;
    case 'eq':
    default:
      return a === b;
  }
}

/**
 * Evaluates rule expressions with result1, result2, ... bound to row arrays from each SQL.
 * Expressions are trusted (same author as task SQL).
 */
export function evaluateQualityRules(
  bundle: QualityRulesBundle,
  queryResults: QueryRunResult[]
): { passed: boolean; details: { index: number; expression: string; computed: number; expected: number; ok: boolean }[] } {
  const details: { index: number; expression: string; computed: number; expected: number; ok: boolean }[] = [];
  const resultArgs = queryResults.map(q => q.rows);
  const argNames = resultArgs.map((_, i) => `result${i + 1}`);
  for (let i = 0; i < bundle.rules.length; i++) {
    const rule = bundle.rules[i];
    const fn = new Function(...argNames, `return (${rule.expression});`);
    let computed = NaN;
    try {
      computed = Number(fn(...resultArgs));
    } catch {
      computed = NaN;
    }
    const ok = Number.isFinite(computed) && compareOp(computed, rule.value, rule.operator);
    details.push({
      index: i,
      expression: rule.expression,
      computed,
      expected: rule.value,
      ok,
    });
  }
  const passed = details.length > 0 && details.every(d => d.ok);
  return { passed, details };
}
