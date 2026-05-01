import type {
  FilterConfig,
  TimeRangeBound,
  TimeRangeSpec,
  TimeRelativeRange,
  TimeRelativeUnit,
} from '../types/chart';
import { isNoValueOperator, isRangeOperator } from './filterOperatorUi';

export const TIME_RELATIVE_UNITS: { value: TimeRelativeUnit; label: string }[] = [
  { value: 'days', label: '天' },
  { value: 'weeks', label: '周' },
  { value: 'months', label: '月' },
  { value: 'quarters', label: '季度' },
  { value: 'years', label: '年' },
];

const YMD = /^\d{4}-\d{2}-\d{2}$/;

export function formatDateYMD(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function parseYmdToLocalDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function subtractRelativeFromDate(amount: number, unit: TimeRelativeUnit, from: Date): Date {
  const result = new Date(from);
  switch (unit) {
    case 'days':
      result.setDate(result.getDate() - amount);
      break;
    case 'weeks':
      result.setDate(result.getDate() - amount * 7);
      break;
    case 'months':
      result.setMonth(result.getMonth() - amount);
      break;
    case 'quarters':
      result.setMonth(result.getMonth() - amount * 3);
      break;
    case 'years':
      result.setFullYear(result.getFullYear() - amount);
      break;
  }
  return result;
}

/** 将整段旧版「过去 N 天」展开为绝对日期（用于发 Cube 查询） */
export function expandTimeRelativeToValues(tr: TimeRelativeRange, now = new Date()): [string, string] {
  const end = new Date(now);
  const start = subtractRelativeFromDate(tr.amount, tr.unit, end);
  return [formatDateYMD(start), formatDateYMD(end)];
}

export function formatTimeRelativeSummary(tr: TimeRelativeRange): string {
  const unitLabel = TIME_RELATIVE_UNITS.find(u => u.value === tr.unit)?.label || tr.unit;
  return `过去 ${tr.amount} ${unitLabel}（至查询当日）`;
}

export function defaultEmptyTimeRange(): TimeRangeSpec {
  return {
    start: { kind: 'absolute', date: '' },
    end: { kind: 'absolute', date: '' },
  };
}

export function isTimeBoundComplete(b: TimeRangeBound): boolean {
  if (b.kind === 'absolute') return Boolean(b.date?.trim());
  return b.relativeUnit != null && b.relativeAmount != null && b.relativeAmount >= 0;
}

export function isTimeRangeSpecComplete(spec: TimeRangeSpec): boolean {
  return isTimeBoundComplete(spec.start) && isTimeBoundComplete(spec.end);
}

/** 展示单端：绝对为 yyyy-MM-dd；相对为「N天前」 */
export function formatTimeBoundDisplay(b: TimeRangeBound): string {
  if (b.kind === 'absolute') {
    const d = b.date?.trim();
    return d || '选择日期';
  }
  const a = b.relativeAmount ?? 0;
  const u = b.relativeUnit ?? 'days';
  const label = TIME_RELATIVE_UNITS.find(x => x.value === u)?.label || u;
  if (a === 0) return `0${label}前（查询当日）`;
  return `${a}${label}前`;
}

function isYmdPair(values: unknown[]): boolean {
  return (
    values.length === 2 &&
    typeof values[0] === 'string' &&
    typeof values[1] === 'string' &&
    YMD.test(values[0]) &&
    YMD.test(values[1])
  );
}

/** 是否存在至少一个非空（trim 后）的取值，用于判断是否参与 Cube 查询 */
export function hasNonEmptyFilterValues(values: unknown[] | undefined): boolean {
  if (!values?.length) return false;
  return values.some(v => v !== null && v !== undefined && String(v).trim() !== '');
}

/**
 * 经 {@link expandFilterForQuery} 展开后的单条筛选是否应写入 Cube query.filters。
 * set / notSet 恒参与；时间范围须为完整两条 yyyy-MM-dd；其余操作符须有非空取值。
 */
export function filterExpandedContributesToCubeQuery(filter: FilterConfig): boolean {
  const op = filter.operator;
  if (isNoValueOperator(op)) return true;
  if (isRangeOperator(op)) {
    return Boolean(filter.values?.length === 2 && isYmdPair(filter.values));
  }
  return hasNonEmptyFilterValues(filter.values);
}

/**
 * 从 timeRange，或旧版 timeRelative / 两条 yyyy-MM-dd 的 values 推导 TimeRangeSpec
 */
export function migrateLegacyToTimeRange(filter: Pick<FilterConfig, 'operator' | 'values' | 'timeRelative' | 'timeRange'>): TimeRangeSpec | null {
  if (!isRangeOperator(filter.operator)) return null;
  if (filter.timeRange != null) {
    return filter.timeRange;
  }
  const tr = filter.timeRelative;
  if (tr && tr.amount > 0) {
    return {
      start: { kind: 'relative', relativeAmount: tr.amount, relativeUnit: tr.unit },
      end: { kind: 'relative', relativeAmount: 0, relativeUnit: 'days' },
    };
  }
  if (filter.values?.length === 2 && isYmdPair(filter.values)) {
    return {
      start: { kind: 'absolute', date: String(filter.values[0]) },
      end: { kind: 'absolute', date: String(filter.values[1]) },
    };
  }
  return null;
}

export function resolveTimeRangeBoundToDate(bound: TimeRangeBound, now: Date): Date {
  if (bound.kind === 'absolute') {
    const d = bound.date?.trim();
    if (!d) return new Date(now);
    return parseYmdToLocalDate(d);
  }
  const amt = bound.relativeAmount ?? 0;
  const u = bound.relativeUnit ?? 'days';
  return subtractRelativeFromDate(amt, u, now);
}

/** 将起止（可混用绝对/相对）展开为 Cube 用的 [小, 大] 日期字符串 */
export function expandTimeRangeSpecForQuery(spec: TimeRangeSpec, now = new Date()): [string, string] {
  const t0 = resolveTimeRangeBoundToDate(spec.start, now).getTime();
  const t1 = resolveTimeRangeBoundToDate(spec.end, now).getTime();
  const lo = Math.min(t0, t1);
  const hi = Math.max(t0, t1);
  return [formatDateYMD(new Date(lo)), formatDateYMD(new Date(hi))];
}

/** 单条筛选：时间范围展开为 values；兼容仅 timeRelative 的旧数据 */
export function expandFilterForQuery(filter: FilterConfig, now = new Date()): FilterConfig {
  if (!isRangeOperator(filter.operator)) return filter;
  const spec = migrateLegacyToTimeRange(filter);
  if (spec && isTimeRangeSpecComplete(spec)) {
    const [a, b] = expandTimeRangeSpecForQuery(spec, now);
    return { ...filter, values: [a, b] };
  }
  const trOnly = filter.timeRelative;
  if (trOnly && trOnly.amount > 0 && !filter.timeRange) {
    const [a, b] = expandTimeRelativeToValues(trOnly, now);
    return { ...filter, values: [a, b] };
  }
  return filter;
}

export function expandFiltersForQuery(filters: FilterConfig[], now = new Date()): FilterConfig[] {
  return filters.map(f => expandFilterForQuery(f, now)).filter(f => filterExpandedContributesToCubeQuery(f));
}
