import type { ChartConfig, FilterConfig } from '../types/chart';

/** 看板筛选取值下拉：非时间、非数值类型视为 string-like（varchar、string 等） */
export function isDashboardStringFilterType(type: string | undefined): boolean {
  if (!type) return true;
  const lower = type.toLowerCase();
  if (lower.includes('time') || lower.includes('date') || lower.includes('timestamp')) return false;
  if (
    lower.includes('int') ||
    lower.includes('decimal') ||
    lower.includes('float') ||
    lower.includes('double') ||
    lower.includes('numeric') ||
    lower === 'number'
  ) {
    return false;
  }
  return true;
}

/**
 * 解析「图表 + 数据集(view) + 成员」后对应用 Cube load 做 distinct 的目标：
 * 与首条绑定语义一致：按 charts 数组顺序找第一条有效 chartBindings；无绑定时按 field 匹配图表。
 */
export function resolveDistinctQueryTarget(
  filter: FilterConfig,
  charts: ChartConfig[]
): { viewName: string; memberField: string } | null {
  if (!isDashboardStringFilterType(filter.type)) return null;
  const bindings = filter.chartBindings;
  if (bindings !== undefined) {
    if (bindings.length === 0) return null;
    for (const c of charts) {
      if (c.id == null || !c.viewName?.trim()) continue;
      const hit = bindings.find(b => b.chartId === c.id && b.field?.trim());
      if (hit) return { viewName: c.viewName.trim(), memberField: hit.field.trim() };
    }
    return null;
  }
  const field = filter.field?.trim();
  if (!field) return null;
  for (const c of charts) {
    if (c.id != null && c.viewName?.trim() && chartMemberMatch(c, field)) {
      return { viewName: c.viewName.trim(), memberField: field };
    }
  }
  return null;
}

/** 该成员是否可能出现在该图表的 Cube 查询中（与 buildCubeQueryFromChart 维度/指标/下钻范围对齐） */
export function chartMemberMatch(chart: ChartConfig, memberField: string): boolean {
  if (chart.dimensions.some(d => d.field === memberField)) return true;
  if (chart.metrics.some(m => m.field === memberField)) return true;
  if (chart.drilldownConfig?.enabled) {
    if (chart.drilldownConfig.dimensions.some(d => d.field === memberField)) return true;
  }
  return false;
}

/**
 * 将看板筛选列表解析为「当前图表」应附加的静态条件（已替换为绑定 field）。
 * - 若筛选器含非空 chartBindings：仅当存在指向本图且 field 非空的绑定时加入；
 * - 否则兼容旧数据：仅当 chartMemberMatch 时加入，field 不变。
 */
export function resolveDashboardFiltersForChart(chart: ChartConfig, dashboardFilters: FilterConfig[]): FilterConfig[] {
  const chartId = chart.id;
  const out: FilterConfig[] = [];

  for (const df of dashboardFilters) {
    const bindings = df.chartBindings;
    // 显式数组：含空数组表示「已配置绑定但不对任何图生效」；undefined 表示走旧版按 field 匹配
    if (bindings !== undefined) {
      if (bindings.length === 0) continue;
      if (chartId == null) continue;
      const hit = bindings.find(b => b.chartId === chartId && b.field?.trim());
      if (!hit) continue;
      out.push({ ...df, field: hit.field });
      continue;
    }
    if (chartMemberMatch(chart, df.field)) {
      out.push(df);
    }
  }

  return out;
}

export function mergeChartAndDashboardFilters(
  chart: ChartConfig,
  chartFilters: FilterConfig[],
  dashboardFilters: FilterConfig[]
): FilterConfig[] {
  const resolved = resolveDashboardFiltersForChart(chart, dashboardFilters);
  const dashboardFieldSet = new Set(resolved.map(f => f.field));
  return [...chartFilters.filter(f => !dashboardFieldSet.has(f.field)), ...resolved];
}

/** 预览 hover：受该看板筛选器影响的图表 id */
export function getAffectedChartIdsForDashboardFilter(filter: FilterConfig, charts: ChartConfig[]): number[] {
  const bindings = filter.chartBindings;
  if (bindings !== undefined) {
    const ids = bindings.filter(b => b.field?.trim()).map(b => b.chartId);
    return [...new Set(ids)];
  }
  const ids: number[] = [];
  for (const c of charts) {
    if (c.id != null && chartMemberMatch(c, filter.field)) {
      ids.push(c.id);
    }
  }
  return ids;
}
