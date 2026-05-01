import type { DynamicDrilldownConfig } from '../types/chart';

/** 历史数据可能缺少 selectionMode，客户端统一视为单选 */
export function normalizeDrilldownConfigForClient(
  drilldown: DynamicDrilldownConfig | null | undefined
): DynamicDrilldownConfig | undefined {
  if (drilldown == null || typeof drilldown !== 'object') return undefined;
  if (drilldown.selectionMode != null) return drilldown;
  return { ...drilldown, selectionMode: 'single' };
}
