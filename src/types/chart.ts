export type ChartType = 'table' | 'line' | 'pie' | 'number' | 'bar' | 'funnel' | 'map';

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

export interface FilterConfig {
  field: string;
  title?: string;
  shortTitle?: string;
  type?: string;
  operator: FilterOperator;
  values: any[];
  isDynamic?: boolean; // 标记是否为动态过滤器
}

// 动态过滤配置（设计时配置，不包含运行时值）
export interface DynamicFilterConfig {
  field: string;
  title?: string;
  shortTitle?: string;
  type?: string;
  operator: FilterOperator;
  defaultValues?: any[]; // 默认值
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
  widgetType?: DashboardWidgetType;
  markdownContent?: string;
  tabGroupTabs?: TabGroupTab[];
  activeTabId?: string;
  // 图表归属关系: "tabGroupId:tabId" 表示归属于某个标签组的某个标签
  belongsTo?: string;
}

export interface DashboardInfo {
  id: number;
  name: string;
  folder_id: number | null;
  filters: FilterConfig[];
  layout: DashboardLayoutItem[];
  chart_count?: number;
  created_at: string;
  updated_at: string;
}
