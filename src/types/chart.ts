export type ChartType = 'table' | 'line' | 'pie' | 'number' | 'bar' | 'funnel' | 'map' | 'rtf-text';

/** 可视化查询页暂不支持的图表类型（看板等仍可能存 funnel/map） */
export function isVisualQueryChartTypeDisabled(type: ChartType): boolean {
  return type === 'funnel' || type === 'map';
}

/** 将可视化查询不支持的类型降级为表格，避免加载旧图表/草稿时报错 */
export function normalizeChartTypeForVisualQuery(type: ChartType): ChartType {
  return isVisualQueryChartTypeDisabled(type) ? 'table' : type;
}

/** 不配置维度 / 下钻的图表类型（数字图仅聚合指标；文本图用插值） */
export function chartTypeUsesNoDimensions(type: ChartType): boolean {
  return type === 'rtf-text' || type === 'number';
}

/** 图表类型允许的最大指标数；undefined 表示不限制 */
export function chartTypeMaxMetrics(type: ChartType): number | undefined {
  switch (type) {
    case 'pie':
    case 'number':
      return 1;
    default:
      return undefined;
  }
}

export type TimeGranularity = 'year' | 'quarter' | 'month' | 'week' | 'day' | 'hour' | 'minute';

export type AggregationType = 'sum' | 'avg' | 'min' | 'max' | 'count' | 'countDistinct';

export type FilterOperator =
  | 'equals'
  | 'notEquals'
  | 'contains'
  | 'notContains'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'in'
  | 'notIn'
  | 'set'
  | 'notSet'
  | 'inDateRange'
  | 'notInDateRange';

/** 时间范围筛选：相对「查询时刻」 */
export type TimeRelativeUnit = 'days' | 'weeks' | 'months' | 'quarters' | 'years';

export interface TimeRelativeRange {
  amount: number;
  unit: TimeRelativeUnit;
}

/** 时间范围的一端：绝对 yyyy-MM-dd，或相对「查询时刻」往前 */
export interface TimeRangeBound {
  kind: 'absolute' | 'relative';
  date?: string;
  relativeAmount?: number;
  relativeUnit?: TimeRelativeUnit;
}

export interface TimeRangeSpec {
  start: TimeRangeBound;
  end: TimeRangeBound;
}

export interface DimensionConfig {
  field: string;
  title?: string;
  type?: string;
  timeGranularity?: TimeGranularity;
}

export interface MetricConfig {
  field: string;
  title?: string;
  type?: string;
  aggregation?: AggregationType;
  isDimensionAsMetric?: boolean;
}

/** 看板筛选器：指定该条件对某张图表使用的 Cube 成员名（通常为维度 field） */
export interface DashboardFilterChartBinding {
  chartId: number;
  field: string;
}

export interface FilterConfig {
  field: string;
  title?: string;
  shortTitle?: string;
  type?: string;
  operator: FilterOperator;
  values: any[];
  isDynamic?: boolean; // 标记是否为动态过滤器
  /** 看板级：按图表显式绑定；有内容时仅对列出的图表生效，且查询使用该行的 field */
  chartBindings?: DashboardFilterChartBinding[];
  /** 看板级：列表展示名（编辑弹窗必填） */
  displayName?: string;
  /** @deprecated 仅兼容旧数据；新逻辑使用 timeRange */
  timeRelative?: TimeRelativeRange;
  /** 时间范围：起止可各自为绝对/相对；发查询前展开为 values */
  timeRange?: TimeRangeSpec;
}

// 动态过滤配置（设计时配置，不包含运行时值）
export interface DynamicFilterConfig {
  field: string;
  title?: string;
  shortTitle?: string;
  type?: string;
  operator: FilterOperator;
  defaultValues?: any[]; // 默认值
  /** 图表上方动态过滤条展示名（配置弹窗必填） */
  displayName?: string;
}

// 动态维度下钻配置
export type DrilldownSelectionMode = 'single' | 'multiple';

export interface DynamicDrilldownConfig {
  enabled: boolean;
  dimensions: DimensionConfig[]; // 可下钻的维度列表
  selectionMode: DrilldownSelectionMode;
  allowEmptySelection: boolean; // 是否允许不选中任何维度
  defaultSelected?: string[]; // 默认选中的维度字段名
}

export interface SortConfig {
  field: string;
  direction: 'asc' | 'desc';
}

/** 文本图（RTF）：无维度；指标可选，纯静态或模板中用 {field} 引用指标 field；展示为插值后的富文本样式 */
export interface RtfTextChartConfig {
  /** 插值模板，占位符为 `{指标字段名}`，与 Cube 返回列名一致 */
  interpolationExpression: string;
  fontSizePx: number;
  color: string;
  /** 文本块背景色（CSS，如 #fffbeb） */
  backgroundColor: string;
}

export interface ChartConfig {
  id?: number;
  name: string;
  viewName: string;
  chartType: ChartType;
  dimensions: DimensionConfig[];
  metrics: MetricConfig[];
  filters: FilterConfig[];
  dynamicFilters?: DynamicFilterConfig[]; // 动态过滤器配置
  drilldownConfig?: DynamicDrilldownConfig; // 动态维度下钻配置
  /** chartType 为 rtf-text 时使用 */
  rtfTextConfig?: RtfTextChartConfig;
  sort: SortConfig[];
  limit: number;
  createdAt?: string;
  updatedAt?: string;
}

// Cube Server metadata types
export interface CubeMember {
  name: string;
  title: string;
  type: string;
  shortTitle?: string;
  description?: string;
  format?: string;
}

export interface CubeMeta {
  name: string;
  title: string;
  type: 'cube' | 'view';
  measures: CubeMember[];
  dimensions: CubeMember[];
  segments?: CubeMember[];
}

export interface CubeLoadResponse {
  cubes: CubeMeta[];
}

// Cube Server query types
export interface TimeDimensionQuery {
  dimension: string;
  granularity?: TimeGranularity;
  dateRange?: string | string[];
}

export interface FilterQuery {
  member: string;
  operator: FilterOperator;
  values: any[];
}

export interface CubeQuery {
  measures: string[];
  dimensions: string[];
  timeDimensions: TimeDimensionQuery[];
  filters: FilterQuery[];
  order: [string, 'asc' | 'desc'][];
  limit?: number;
}

export interface CubeSqlResponse {
  sql: string;
}

// Dashboard types
export interface DashboardFolder {
  id: number;
  name: string;
  parent_id: number | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export type DashboardWidgetType = 'chart' | 'filter' | 'markdown' | 'tab-group';

// 标签组内部的图表布局
export interface InnerChartLayout {
  chartId: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface TabGroupTab {
  id: string;
  label: string;
  chartIds: number[];
  innerLayout?: InnerChartLayout[];
}

export interface DashboardLayoutItem {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
  minW?: number;
  minH?: number;
  maxW?: number;
  widgetType?: DashboardWidgetType;
  markdownContent?: string;
  tabGroupTabs?: TabGroupTab[];
  activeTabId?: string;
  /** 内置默认标签组（id 一般为 default-tab-group），Pin 图表优先进入 */
  isDefaultTabGroup?: boolean;
  /** 标签组通栏标题；预览时未设置、空白或与「默认标签组」「标签组 N」等占位文案相同时不显示标题栏，编辑模式仍显示默认「标签组」 */
  tabGroupTitle?: string;
  // 图表归属关系: "tabGroupId:tabId" 表示归属于某个标签组的某个标签
  belongsTo?: string;
}

export interface DashboardInfo {
  id: number;
  name: string;
  folder_id: number | null;
  /** 同一 folder 内的展示顺序（与 updated_at 无关） */
  sort_order: number;
  filters: FilterConfig[];
  layout: DashboardLayoutItem[];
  chart_count?: number;
  created_at: string;
  updated_at: string;
}
