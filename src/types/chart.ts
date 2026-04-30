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

export interface DashboardLayoutItem {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
  minW?: number;
  minH?: number;
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
