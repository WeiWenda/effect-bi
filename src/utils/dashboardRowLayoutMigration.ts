import type { DashboardLayoutItem } from '../types/chart';

/**
 * Future Superset-style row/column layout (not yet used by DashboardDetailPage).
 * Enables versioning dashboard JSON without breaking existing `layout: DashboardLayoutItem[]`.
 */
export interface DashboardRowCell {
  span: number;
  kind: 'chart' | 'widget';
  ref: string;
  widgetType?: string;
}

export interface DashboardRow {
  id: string;
  cells: DashboardRowCell[];
}

export interface DashboardRowLayoutV2 {
  version: 2;
  rows: DashboardRow[];
}

/**
 * Placeholder for converting legacy react-grid positions to row/column trees.
 * Implement grouping by `y` bands and merging adjacent cells when ready to switch root layout engine.
 */
export function migrateDashboardLayoutItemsToRowSchema(_layout: DashboardLayoutItem[]): DashboardRowLayoutV2 {
  return {
    version: 2,
    rows: [],
  };
}
