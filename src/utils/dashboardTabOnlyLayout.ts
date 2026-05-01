import type { DashboardLayoutItem } from '../types/chart';

/** 固定 id：默认标签组容器，Pin 的图表会进入其第一个标签页 */
export const DEFAULT_TAB_GROUP_WIDGET_ID = 'default-tab-group';

const DEFAULT_FIRST_TAB_ID = 'default-tab-main';

export function makeDefaultTabGroupLayoutItem(y = 0): DashboardLayoutItem {
  return {
    i: DEFAULT_TAB_GROUP_WIDGET_ID,
    x: 0,
    y,
    w: 12,
    h: 6,
    minW: 12,
    maxW: 12,
    minH: 4,
    widgetType: 'tab-group',
    isDefaultTabGroup: true,
    tabGroupTabs: [{ id: DEFAULT_FIRST_TAB_ID, label: '默认', chartIds: [] }],
    activeTabId: DEFAULT_FIRST_TAB_ID,
  };
}

function collectChartIdsInTabGroups(layout: DashboardLayoutItem[]): Set<number> {
  const s = new Set<number>();
  for (const item of layout) {
    if (item.widgetType !== 'tab-group' || !item.tabGroupTabs) continue;
    for (const tab of item.tabGroupTabs) {
      for (const cid of tab.chartIds) {
        s.add(cid);
      }
    }
  }
  return s;
}

/**
 * 解析图表所在「标签组标题 · 标签页名称」（与看板标签组迁移目标文案一致）。
 * 仅遍历 tab-group 的 tab.chartIds；同一 chartId 若重复出现在多个 tab，后遍历到的覆盖前者。
 */
export function buildChartTabPlacementMap(layout: DashboardLayoutItem[]): Map<number, string> {
  const map = new Map<number, string>();
  const tabGroups = layout.filter(l => l.widgetType === 'tab-group' && l.tabGroupTabs?.length);
  tabGroups.forEach((l, index) => {
    const tabGroupLabel =
      l.tabGroupTitle?.trim() ||
      (l.isDefaultTabGroup ? '默认标签组' : `标签组 ${index + 1}`);
    for (const tab of l.tabGroupTabs || []) {
      for (const cid of tab.chartIds) {
        if (typeof cid === 'number' && !Number.isNaN(cid)) {
          map.set(cid, `${tabGroupLabel} · ${tab.label}`);
        }
      }
    }
  });
  return map;
}

/** 是否为旧版「顶层图表」格子（纯数字 i） */
function isLegacyTopLevelChartItem(item: DashboardLayoutItem): boolean {
  if (item.widgetType && item.widgetType !== 'chart') return false;
  if (item.widgetType === 'chart') return true;
  if (item.belongsTo) return true;
  const n = parseInt(item.i, 10);
  return !Number.isNaN(n) && String(n) === item.i;
}

/**
 * 看板仅允许图表出现在标签组内：去掉顶层图表项、孤儿图表并入默认标签组、保证存在 default-tab-group。
 */
export function migrateLayoutToTabOnly(
  layout: DashboardLayoutItem[],
  allChartIds: number[]
): DashboardLayoutItem[] {
  const inTabs = collectChartIdsInTabGroups(layout);
  const orphans = allChartIds.filter(id => inTabs.has(id) === false);

  let L = layout.filter(item => !isLegacyTopLevelChartItem(item));

  const hasDefault = L.some(
    w => w.widgetType === 'tab-group' && w.i === DEFAULT_TAB_GROUP_WIDGET_ID
  );
  if (!hasDefault) {
    const maxY = L.length > 0 ? Math.max(...L.map(it => it.y + it.h)) : 0;
    L = [...L, makeDefaultTabGroupLayoutItem(maxY)];
  }

  if (orphans.length === 0) return L;

  return L.map(item => {
    if (item.i !== DEFAULT_TAB_GROUP_WIDGET_ID || !item.tabGroupTabs?.length) return item;
    const tabs = item.tabGroupTabs.map((t, idx) =>
      idx === 0
        ? { ...t, chartIds: [...new Set([...t.chartIds, ...orphans])] }
        : t
    );
    return { ...item, tabGroupTabs: tabs };
  });
}

export function removeChartIdFromAllTabGroups(layout: DashboardLayoutItem[], chartId: number): DashboardLayoutItem[] {
  return layout.map(item => {
    if (item.widgetType !== 'tab-group' || !item.tabGroupTabs) return item;
    return {
      ...item,
      tabGroupTabs: item.tabGroupTabs.map(tab => ({
        ...tab,
        chartIds: tab.chartIds.filter(id => id !== chartId),
        innerLayout: tab.innerLayout?.filter(il => il.chartId !== chartId),
      })),
    };
  });
}

/** 从所有标签页移除该图表后，仅挂到指定标签组的某一标签下（用于 Pin 到指定标签、看板内添加图表等） */
export function assignChartToTabInGroup(
  layout: DashboardLayoutItem[],
  tabGroupId: string,
  tabId: string,
  chartId: number
): DashboardLayoutItem[] {
  const cleared = removeChartIdFromAllTabGroups(layout, chartId);
  return cleared.map(item => {
    if (item.i !== tabGroupId || !item.tabGroupTabs) return item;
    return {
      ...item,
      tabGroupTabs: item.tabGroupTabs.map(t =>
        t.id === tabId && !t.chartIds.includes(chartId)
          ? { ...t, chartIds: [...t.chartIds, chartId] }
          : t
      ),
    };
  });
}

export function tabGroupIdsInOrder(layout: DashboardLayoutItem[]): string[] {
  return layout
    .filter(w => w.widgetType === 'tab-group')
    .sort((a, b) => a.y - b.y || a.i.localeCompare(b.i))
    .map(w => w.i);
}

/** 主列通栏块：看板筛选器、Markdown、标签组（与侧栏拖拽顺序一致） */
export function isMainStackWidget(item: DashboardLayoutItem): boolean {
  const t = item.widgetType;
  return t === 'filter' || t === 'markdown' || t === 'tab-group';
}

/** 主列块 id 顺序（按当前 layout 的 y） */
export function mainStackIdsInOrder(layout: DashboardLayoutItem[]): string[] {
  return layout
    .filter(isMainStackWidget)
    .sort((a, b) => a.y - b.y || a.i.localeCompare(b.i))
    .map(l => l.i);
}

/**
 * 按侧栏给出的顺序重排主列（筛选 / Markdown / 标签组），自上而下重写 y、通栏 w；
 * 其余 layout 项（若有）接在主列之后。
 */
export function mergeLayoutWithMainStackOrder(
  layout: DashboardLayoutItem[],
  stackOrderIds: string[]
): DashboardLayoutItem[] {
  const itemMap = new Map(layout.map(l => [l.i, { ...l }]));
  const mainIds = layout.filter(isMainStackWidget).map(l => l.i);
  const mainSet = new Set(mainIds);

  const order: string[] = [];
  for (const id of stackOrderIds) {
    if (mainSet.has(id) && itemMap.has(id)) order.push(id);
  }
  for (const id of mainIds) {
    if (!order.includes(id)) order.push(id);
  }

  let y = 0;
  const stacked: DashboardLayoutItem[] = [];
  for (const id of order) {
    const item = itemMap.get(id);
    if (!item) continue;
    if (item.widgetType === 'tab-group') {
      stacked.push({
        ...item,
        x: 0,
        w: 12,
        minW: 12,
        maxW: 12,
        y,
      });
    } else {
      stacked.push({
        ...item,
        x: 0,
        w: 12,
        y,
      });
    }
    y += item.h;
  }

  const rest = layout.filter(l => !mainSet.has(l.i)).sort((a, b) => a.y - b.y || a.i.localeCompare(b.i));
  for (const item of rest) {
    stacked.push({ ...item, x: 0, w: 12, y });
    y += item.h;
  }

  return stacked;
}
