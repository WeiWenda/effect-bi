import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { Trash2Icon, PencilIcon, PlusIcon, LayersIcon, ArrowRightLeftIcon, GripVerticalIcon } from 'lucide-react';
import { ChartRenderer } from '../query-explore/ChartRenderer';
import { ChartDynamicControls } from '../query-explore/ChartDynamicControls';
import type { DashboardLayoutItem, ChartConfig, TabGroupTab, InnerChartLayout, DimensionConfig } from '../../types/chart';
import { TAB_GROUP_GRID_GAP_PX, TAB_GROUP_INNER_ROW_HEIGHT_PX, TAB_GROUP_INNER_COLS } from '../../constants/dashboardLayout';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

export interface TabGroupRelocationTarget {
  tabGroupId: string;
  tabGroupLabel: string;
  tabs: { id: string; label: string }[];
}

interface TabGroupContainerProps {
  item: DashboardLayoutItem;
  charts: ChartConfig[];
  mode: 'edit' | 'preview';
  chartDataMap: Record<number, any[]>;
  loadingData: Set<number>;
  onRemoveWidget: () => void;
  onAddTab: () => void;
  onSwitchTab: (tabId: string) => void;
  onRemoveTab: (tabId: string) => void;
  onRenameTab: (tabId: string, label: string) => void;
  onRenameGroup: (title: string) => void;
  relocationTargets: TabGroupRelocationTarget[];
  onMoveChartToTab: (chartId: number, fromTabId: string, toTabGroupId: string, toTabId: string) => void;
  /** 编辑模式下在当前标签打开「添加图表」全屏查询 */
  onOpenAddChart?: (tabId: string) => void;
  onInnerLayoutChange: (tabId: string, newLayout: InnerChartLayout[]) => void;
  chartDynamicFilterValues: Record<number, Record<string, string[]>>;
  chartDrilldownSelections: Record<number, string[]>;
  onDynamicFilterChange: (chartId: number, field: string, values: string[]) => void;
  onDrilldownChange: (chartId: number, dimensions: string[]) => void;
  onChartConfigChange: (chartId: number, newConfig: Partial<ChartConfig>) => void;
  /** 编辑模式：从看板彻底删除图表（含布局与后端） */
  onRemoveChart?: (chartId: number) => void | Promise<void>;
  allAvailableFields: { name: string; title: string; type: string }[];
  onHeightChange?: (height: number) => void;
  /** 预览看板筛选悬停时高亮对应图表卡片 */
  highlightChartIds?: number[];
}

const DEFAULT_CHART_W = 6;
const DEFAULT_CHART_H = 4;
const MIN_CHART_W = 3;
const MIN_CHART_H = 2;

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

/** 新建标签页「标签 1」「标签2」、默认标签组首标签「默认」——预览时不展示标签栏 */
function isPlaceholderTabLabelForPreview(label: string): boolean {
  const t = label.trim();
  if (/^标签\s*\d+$/.test(t)) return true;
  return t === '默认';
}

/** 与侧栏/迁移占位文案一致——预览时不展示通栏标题（编辑模式仍展示） */
function isPlaceholderGroupTitleForPreview(title: string): boolean {
  const t = title.trim();
  if (t === '默认标签组') return true;
  if (t === '标签组') return true;
  return /^标签组\s*\d+$/.test(t);
}

/** Column width in px (12 equal tracks, 11 gaps). */
function columnWidthPx(gridInnerWidth: number): number {
  const g = TAB_GROUP_GRID_GAP_PX;
  const cols = TAB_GROUP_INNER_COLS;
  return (gridInnerWidth - g * (cols - 1)) / cols;
}

/** Convert pixel span to grid column units (approximate inverse of CSS grid span). */
function pxToColSpan(px: number, gridInnerWidth: number): number {
  const colW = columnWidthPx(gridInnerWidth);
  const g = TAB_GROUP_GRID_GAP_PX;
  return Math.max(1, Math.round((px + g) / (colW + g)));
}

function pxToRowSpan(px: number): number {
  const g = TAB_GROUP_GRID_GAP_PX;
  const row = TAB_GROUP_INNER_ROW_HEIGHT_PX;
  return Math.max(1, Math.round((px + g) / (row + g)));
}

function computeDragPreview(
  startX: number,
  startY: number,
  clientX: number,
  clientY: number,
  gridInnerWidth: number,
  origX: number,
  origY: number,
  origW: number,
  origH: number
): { x: number; y: number; w: number; h: number } {
  if (gridInnerWidth <= 0) {
    return { x: origX, y: origY, w: origW, h: origH };
  }
  const colW = columnWidthPx(gridInnerWidth);
  const g = TAB_GROUP_GRID_GAP_PX;
  const stepX = colW + g;
  const stepY = TAB_GROUP_INNER_ROW_HEIGHT_PX + g;
  const dx = clientX - startX;
  const dy = clientY - startY;
  const deltaCols = Math.round(dx / stepX);
  const deltaRows = Math.round(dy / stepY);
  const nx = clamp(origX + deltaCols, 0, TAB_GROUP_INNER_COLS - origW);
  const ny = Math.max(0, origY + deltaRows);
  return { x: nx, y: ny, w: origW, h: origH };
}

function computeResizePreview(
  startX: number,
  startY: number,
  clientX: number,
  clientY: number,
  gridInnerWidth: number,
  anchorX: number,
  anchorY: number,
  origPxW: number,
  origPxH: number
): { x: number; y: number; w: number; h: number } {
  if (gridInnerWidth <= 0) {
    return { x: anchorX, y: anchorY, w: MIN_CHART_W, h: MIN_CHART_H };
  }
  const dx = clientX - startX;
  const dy = clientY - startY;
  const newPxW = Math.max(40, origPxW + dx);
  const newPxH = Math.max(40, origPxH + dy);
  let nw = pxToColSpan(newPxW, gridInnerWidth);
  let nh = pxToRowSpan(newPxH);
  nw = clamp(nw, MIN_CHART_W, TAB_GROUP_INNER_COLS - anchorX);
  nh = clamp(nh, MIN_CHART_H, 80);
  return { x: anchorX, y: anchorY, w: nw, h: nh };
}

export function TabGroupContainer({
  item,
  charts,
  mode,
  chartDataMap,
  loadingData,
  onRemoveWidget,
  onAddTab,
  onSwitchTab,
  onRemoveTab,
  onRenameTab,
  onRenameGroup,
  relocationTargets,
  onMoveChartToTab,
  onOpenAddChart,
  onInnerLayoutChange,
  chartDynamicFilterValues,
  chartDrilldownSelections,
  onDynamicFilterChange,
  onDrilldownChange,
  onChartConfigChange,
  onRemoveChart,
  allAvailableFields,
  onHeightChange,
  highlightChartIds,
}: TabGroupContainerProps): React.JSX.Element {
  const tabs = item.tabGroupTabs || [];
  const activeTab = tabs.find(t => t.id === item.activeTabId) || tabs[0];
  const isEdit = mode === 'edit';
  const groupTitleTrimmed = item.tabGroupTitle?.trim() ?? '';
  const showGroupHeader =
    isEdit ||
    (groupTitleTrimmed.length > 0 && !isPlaceholderGroupTitleForPreview(groupTitleTrimmed));
  const hideTabsBarInPreview =
    !isEdit &&
    tabs.length === 1 &&
    tabs[0] != null &&
    isPlaceholderTabLabelForPreview(tabs[0].label);

  const containerRef = useRef<HTMLDivElement>(null);
  const innerGridRef = useRef<HTMLDivElement>(null);
  const [containerHeight, setContainerHeight] = useState<number | null>(null);
  const [gridInnerWidth, setGridInnerWidth] = useState(0);

  const tabCharts = useMemo(() => {
    if (!activeTab) return [];
    return activeTab.chartIds
      .map(id => charts.find(c => c.id === id))
      .filter((c): c is ChartConfig => c !== undefined);
  }, [activeTab, charts]);

  const innerCells = useMemo((): InnerChartLayout[] => {
    if (!activeTab) return [];

    const savedLayout = activeTab.innerLayout || [];
    const savedLayoutMap = new Map(savedLayout.map(l => [l.chartId, l]));

    let currentY = 0;
    return activeTab.chartIds.map((chartId, idx) => {
      const saved = savedLayoutMap.get(chartId);
      if (saved) {
        return {
          chartId,
          x: saved.x,
          y: saved.y,
          w: saved.w,
          h: saved.h,
        };
      }

      const w = DEFAULT_CHART_W;
      const h = DEFAULT_CHART_H;
      const x = (idx % 2) * w;
      const y = currentY;
      if (idx % 2 === 1) currentY += h;

      return { chartId, x, y, w, h };
    });
  }, [activeTab]);

  const maxRowSpan = useMemo(() => {
    if (innerCells.length === 0) return 0;
    return Math.max(...innerCells.map(c => c.y + c.h));
  }, [innerCells]);

  const commitInnerLayout = useCallback(
    (next: InnerChartLayout[]) => {
      if (!activeTab) return;
      onInnerLayoutChange(activeTab.id, next);
    },
    [activeTab, onInnerLayoutChange]
  );

  const patchCell = useCallback(
    (chartId: number, patch: Partial<Pick<InnerChartLayout, 'x' | 'y' | 'w' | 'h'>>) => {
      const next = innerCells.map(c =>
        c.chartId === chartId ? { ...c, ...patch, chartId } : c
      );
      commitInnerLayout(next);
    },
    [innerCells, commitInnerLayout]
  );

  useEffect(() => {
    const el = innerGridRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      const w = entries[0]?.contentRect.width ?? 0;
      setGridInnerWidth(w);
    });
    ro.observe(el);
    setGridInnerWidth(el.getBoundingClientRect().width);
    return () => ro.disconnect();
  }, [activeTab?.id, maxRowSpan]);

  const hasDynamicControls = useCallback((chart: ChartConfig): boolean => {
    return Boolean(
      (chart.dynamicFilters && chart.dynamicFilters.length > 0) || chart.drilldownConfig?.enabled
    );
  }, []);

  const getEffectiveDimensions = useCallback(
    (chart: ChartConfig) => {
      const currentDrilldownSelections =
        chartDrilldownSelections[chart.id!] || (chart.drilldownConfig?.defaultSelected ?? []);

      const effectiveDimensions = [...chart.dimensions];
      if (chart.drilldownConfig?.enabled && currentDrilldownSelections.length > 0) {
        for (const dim of chart.drilldownConfig.dimensions) {
          if (
            currentDrilldownSelections.includes(dim.field) &&
            !effectiveDimensions.some(d => d.field === dim.field)
          ) {
            effectiveDimensions.push(dim);
          }
        }
      }
      return effectiveDimensions;
    },
    [chartDrilldownSelections]
  );

  useEffect(() => {
    const calculateHeight = () => {
      if (!containerRef.current || !activeTab) return;

      const container = containerRef.current;
      const headerHeight = container.querySelector('.tab-group-header')?.clientHeight || 0;
      const tabsHeight = container.querySelector('.tab-group-tabs')?.clientHeight || 0;
      const addChartBarHeight = container.querySelector('.tab-group-add-chart-bar')?.clientHeight || 0;

      let chartsHeight = 0;
      if (activeTab.chartIds.length > 0 && maxRowSpan > 0) {
        chartsHeight =
          maxRowSpan * TAB_GROUP_INNER_ROW_HEIGHT_PX +
          Math.max(0, maxRowSpan - 1) * TAB_GROUP_GRID_GAP_PX +
          16;
      } else {
        chartsHeight = 150;
      }

      const totalHeight =
        headerHeight + tabsHeight + addChartBarHeight + chartsHeight + 24;
      setContainerHeight(totalHeight);
      onHeightChange?.(totalHeight);
    };

    calculateHeight();
    const resizeObserver = new ResizeObserver(calculateHeight);
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }
    return () => resizeObserver.disconnect();
  }, [activeTab, maxRowSpan, tabCharts.length, isEdit, showGroupHeader, hideTabsBarInPreview, onHeightChange]);

  return (
    <div
      ref={containerRef}
      className="bg-white rounded-lg border-2 border-purple-300 shadow-md overflow-hidden flex flex-col"
      style={{ height: containerHeight ? `${containerHeight}px` : 'auto', minHeight: '200px' }}
    >
      {showGroupHeader && (
        <div className="tab-group-header flex items-center justify-between px-3 py-2 border-b border-purple-200 bg-purple-100 shrink-0 gap-2">
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            <LayersIcon className="size-4 text-purple-600 shrink-0" />
            {isEdit ? (
              <TabGroupTitleEditor
                storedTitle={item.tabGroupTitle ?? ''}
                fallbackLabel="标签组"
                onCommit={onRenameGroup}
              />
            ) : (
              <span className="text-sm font-semibold text-purple-800 truncate">{groupTitleTrimmed}</span>
            )}
          </div>
          {isEdit && (
            <button
              onClick={onRemoveWidget}
              className="chart-card-action p-1 hover:bg-red-100 rounded text-gray-500 hover:text-red-600 transition-colors shrink-0"
              title="移除标签组"
            >
              <Trash2Icon className="size-3.5" />
            </button>
          )}
        </div>
      )}

      {!hideTabsBarInPreview && (
        <div className="tab-group-tabs flex items-center border-b border-purple-100 px-2 py-1 shrink-0 overflow-x-auto bg-purple-50/30">
          {tabs.map(tab => (
            <TabLabel
              key={tab.id}
              tab={tab}
              isActive={tab.id === activeTab?.id}
              isEdit={isEdit}
              canRemove={tabs.length > 1}
              onSwitch={() => onSwitchTab(tab.id)}
              onRemove={() => onRemoveTab(tab.id)}
              onRename={label => onRenameTab(tab.id, label)}
            />
          ))}
          {isEdit && (
            <button
              onClick={onAddTab}
              className="chart-card-action p-1 text-gray-400 hover:text-purple-600 transition-colors"
              title="添加标签"
            >
              <PlusIcon className="size-3.5" />
            </button>
          )}
        </div>
      )}

      <div className="flex-1 overflow-auto p-3 bg-gray-50/30 min-h-0">
        {activeTab ? (
          <div className="h-full flex flex-col gap-3">
            {isEdit && activeTab && onOpenAddChart && (
              <div className="tab-group-add-chart-bar flex items-center gap-2 p-2 bg-white rounded border border-dashed border-purple-200 shrink-0">
                <button
                  type="button"
                  onClick={() => onOpenAddChart(activeTab.id)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-purple-600 text-white rounded-md hover:bg-purple-700 transition-colors"
                >
                  <PlusIcon className="size-3.5" />
                  添加图表
                </button>
                <span className="text-xs text-gray-500 hidden sm:inline">与查询页相同，确认后进入当前标签</span>
              </div>
            )}

            {activeTab.chartIds.length === 0 ? (
              <div className="flex flex-col items-center justify-center flex-1 text-gray-400 border-2 border-dashed border-gray-200 rounded-lg min-h-[150px]">
                <LayersIcon className="size-8 mb-2" />
                <span className="text-xs">
                  {isEdit && onOpenAddChart ? '点击「添加图表」新建图表' : '暂无图表'}
                </span>
              </div>
            ) : (
              <div ref={innerGridRef} className="flex-1 min-h-0 w-full">
                <div
                  className="grid w-full min-h-0"
                  style={{
                    gridTemplateColumns: `repeat(${TAB_GROUP_INNER_COLS}, minmax(0, 1fr))`,
                    gridTemplateRows: `repeat(${Math.max(maxRowSpan, 1)}, minmax(${TAB_GROUP_INNER_ROW_HEIGHT_PX}px, auto))`,
                    gridAutoRows: `minmax(${TAB_GROUP_INNER_ROW_HEIGHT_PX}px, auto)`,
                    gap: TAB_GROUP_GRID_GAP_PX,
                  }}
                >
                  {tabCharts.map(chart => {
                    const cell = innerCells.find(c => c.chartId === chart.id);
                    if (!cell || !chart.id) return null;

                    return (
                      <TabInnerChartCard
                        key={chart.id}
                        chart={chart}
                        cell={cell}
                        gridInnerWidth={gridInnerWidth}
                        isEdit={isEdit}
                        chartDataMap={chartDataMap}
                        loadingData={loadingData}
                        chartDynamicFilterValues={chartDynamicFilterValues}
                        chartDrilldownSelections={chartDrilldownSelections}
                        getEffectiveDimensions={getEffectiveDimensions}
                        hasDynamicControls={hasDynamicControls}
                        allAvailableFields={allAvailableFields}
                        onDynamicFilterChange={onDynamicFilterChange}
                        onDrilldownChange={onDrilldownChange}
                        onChartConfigChange={onChartConfigChange}
                        onRemoveChart={onRemoveChart}
                        relocationTargets={relocationTargets}
                        tabGroupWidgetId={item.i}
                        onMoveChartToTab={onMoveChartToTab}
                        activeTabId={activeTab.id}
                        onPatchCell={patchCell}
                        highlightChartIds={highlightChartIds}
                      />
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-center h-full text-gray-300 text-xs">暂无标签</div>
        )}
      </div>
    </div>
  );
}

function TabInnerChartCard({
  chart,
  cell,
  gridInnerWidth,
  isEdit,
  chartDataMap,
  loadingData,
  chartDynamicFilterValues,
  chartDrilldownSelections,
  getEffectiveDimensions,
  hasDynamicControls,
  allAvailableFields,
  onDynamicFilterChange,
  onDrilldownChange,
  onChartConfigChange,
  onRemoveChart,
  relocationTargets,
  tabGroupWidgetId,
  onMoveChartToTab,
  activeTabId,
  onPatchCell,
  highlightChartIds,
}: {
  chart: ChartConfig;
  cell: InnerChartLayout;
  gridInnerWidth: number;
  isEdit: boolean;
  chartDataMap: Record<number, any[]>;
  loadingData: Set<number>;
  chartDynamicFilterValues: Record<number, Record<string, string[]>>;
  chartDrilldownSelections: Record<number, string[]>;
  getEffectiveDimensions: (c: ChartConfig) => DimensionConfig[];
  hasDynamicControls: (c: ChartConfig) => boolean;
  allAvailableFields: { name: string; title: string; type: string }[];
  onDynamicFilterChange: (chartId: number, field: string, values: string[]) => void;
  onDrilldownChange: (chartId: number, dimensions: string[]) => void;
  onChartConfigChange: (chartId: number, newConfig: Partial<ChartConfig>) => void;
  onRemoveChart?: (chartId: number) => void | Promise<void>;
  relocationTargets: TabGroupRelocationTarget[];
  tabGroupWidgetId: string;
  onMoveChartToTab: (chartId: number, fromTabId: string, toTabGroupId: string, toTabId: string) => void;
  activeTabId: string;
  onPatchCell: (chartId: number, patch: Partial<Pick<InnerChartLayout, 'x' | 'y' | 'w' | 'h'>>) => void;
  highlightChartIds?: number[];
}): React.JSX.Element {
  const moveOptions = useMemo(() => {
    const out: { key: string; tabGroupId: string; tabId: string; label: string }[] = [];
    for (const g of relocationTargets) {
      for (const t of g.tabs) {
        if (g.tabGroupId === tabGroupWidgetId && t.id === activeTabId) continue;
        out.push({
          key: `${g.tabGroupId}:${t.id}`,
          tabGroupId: g.tabGroupId,
          tabId: t.id,
          label: `${g.tabGroupLabel} · ${t.label}`,
        });
      }
    }
    return out;
  }, [relocationTargets, tabGroupWidgetId, activeTabId]);

  const [moveDialogOpen, setMoveDialogOpen] = useState(false);
  const [selectedMoveKey, setSelectedMoveKey] = useState<string>('');
  const [removeDialogOpen, setRemoveDialogOpen] = useState(false);
  const [removeSubmitting, setRemoveSubmitting] = useState(false);

  useEffect(() => {
    if (moveDialogOpen && moveOptions.length > 0) {
      setSelectedMoveKey(prev => (moveOptions.some(o => o.key === prev) ? prev : moveOptions[0].key));
    }
  }, [moveDialogOpen, moveOptions]);

  const data = chartDataMap[chart.id!] || [];
  const isLoading = loadingData.has(chart.id!);
  const currentDynamicFilterValues = chartDynamicFilterValues[chart.id!] || {};
  const currentDrilldownSelections =
    chartDrilldownSelections[chart.id!] || (chart.drilldownConfig?.defaultSelected ?? []);
  const effectiveDimensions = getEffectiveDimensions(chart);

  const [previewRect, setPreviewRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const displayCell = previewRect ?? {
    x: cell.x,
    y: cell.y,
    w: cell.w,
    h: cell.h,
  };

  useEffect(() => {
    setPreviewRect(null);
  }, [cell.x, cell.y, cell.w, cell.h, chart.id]);

  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
    origW: number;
    origH: number;
  } | null>(null);

  const resizeRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    origW: number;
    origH: number;
    origPxW: number;
    origPxH: number;
    anchorX: number;
    anchorY: number;
  } | null>(null);

  const onDragPointerDown = (e: React.PointerEvent) => {
    if (!isEdit) return;
    e.stopPropagation();
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      origX: cell.x,
      origY: cell.y,
      origW: cell.w,
      origH: cell.h,
    };
    setPreviewRect({
      x: cell.x,
      y: cell.y,
      w: cell.w,
      h: cell.h,
    });
  };

  const onDragPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d || e.pointerId !== d.pointerId) return;
    e.stopPropagation();
    const next = computeDragPreview(
      d.startX,
      d.startY,
      e.clientX,
      e.clientY,
      gridInnerWidth,
      d.origX,
      d.origY,
      d.origW,
      d.origH
    );
    setPreviewRect(next);
  };

  const onDragPointerUp = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d || e.pointerId !== d.pointerId) return;
    e.stopPropagation();
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    dragRef.current = null;

    const next = computeDragPreview(
      d.startX,
      d.startY,
      e.clientX,
      e.clientY,
      gridInnerWidth,
      d.origX,
      d.origY,
      d.origW,
      d.origH
    );
    setPreviewRect(null);
    if (next.x !== d.origX || next.y !== d.origY) {
      onPatchCell(chart.id!, { x: next.x, y: next.y });
    }
  };

  const onDragPointerCancel = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d || e.pointerId !== d.pointerId) return;
    e.stopPropagation();
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    dragRef.current = null;
    setPreviewRect(null);
  };

  const onResizePointerDown = (e: React.PointerEvent) => {
    if (!isEdit) return;
    e.stopPropagation();
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const colW = columnWidthPx(gridInnerWidth);
    const g = TAB_GROUP_GRID_GAP_PX;
    const origPxW = cell.w * colW + (cell.w - 1) * g;
    const origPxH = cell.h * TAB_GROUP_INNER_ROW_HEIGHT_PX + (cell.h - 1) * g;
    resizeRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      origW: cell.w,
      origH: cell.h,
      origPxW,
      origPxH,
      anchorX: cell.x,
      anchorY: cell.y,
    };
    setPreviewRect({
      x: cell.x,
      y: cell.y,
      w: cell.w,
      h: cell.h,
    });
  };

  const onResizePointerMove = (e: React.PointerEvent) => {
    const r = resizeRef.current;
    if (!r || e.pointerId !== r.pointerId) return;
    e.stopPropagation();
    const next = computeResizePreview(
      r.startX,
      r.startY,
      e.clientX,
      e.clientY,
      gridInnerWidth,
      r.anchorX,
      r.anchorY,
      r.origPxW,
      r.origPxH
    );
    setPreviewRect(next);
  };

  const onResizePointerUp = (e: React.PointerEvent) => {
    const r = resizeRef.current;
    if (!r || e.pointerId !== r.pointerId) return;
    e.stopPropagation();
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    resizeRef.current = null;

    const next = computeResizePreview(
      r.startX,
      r.startY,
      e.clientX,
      e.clientY,
      gridInnerWidth,
      r.anchorX,
      r.anchorY,
      r.origPxW,
      r.origPxH
    );
    setPreviewRect(null);
    if (next.w !== r.origW || next.h !== r.origH) {
      onPatchCell(chart.id!, { w: next.w, h: next.h });
    }
  };

  const onResizePointerCancel = (e: React.PointerEvent) => {
    const r = resizeRef.current;
    if (!r || e.pointerId !== r.pointerId) return;
    e.stopPropagation();
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    resizeRef.current = null;
    setPreviewRect(null);
  };

  const isHighlight =
    chart.id != null &&
    highlightChartIds != null &&
    highlightChartIds.length > 0 &&
    highlightChartIds.includes(chart.id);

  return (
    <div
      data-chart-id={chart.id ?? undefined}
      className={`bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden flex flex-col min-h-0 relative transition-shadow ${
        isHighlight ? 'ring-2 ring-blue-500 ring-offset-2 z-[1]' : ''
      }`}
      style={{
        gridColumn: `${displayCell.x + 1} / span ${displayCell.w}`,
        gridRow: `${displayCell.y + 1} / span ${displayCell.h}`,
      }}
      onPointerDown={e => e.stopPropagation()}
    >
      <div className="flex items-center justify-between px-2 py-1 border-b border-gray-100 bg-gray-50/50 shrink-0">
        <div className="flex items-center gap-1.5 min-w-0">
          {isEdit && (
            <span
              className="tab-inner-chart-drag-handle cursor-grab active:cursor-grabbing touch-none p-0.5 -m-0.5"
              onPointerDown={onDragPointerDown}
              onPointerMove={onDragPointerMove}
              onPointerUp={onDragPointerUp}
              onPointerCancel={onDragPointerCancel}
            >
              <GripVerticalIcon className="size-3.5 text-gray-300 pointer-events-none" />
            </span>
          )}
          <span className="text-xs font-medium text-gray-700 truncate">{chart.name}</span>
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            type="button"
            onClick={e => {
              e.stopPropagation();
              window.open(`/query?chartId=${chart.id}`, '_blank');
            }}
            className="chart-card-action p-1 hover:bg-gray-100 rounded text-gray-400 hover:text-blue-500 transition-colors"
            title="编辑图表"
          >
            <PencilIcon className="size-3" />
          </button>
          {isEdit && (
            <button
              type="button"
              onClick={e => {
                e.stopPropagation();
                if (moveOptions.length === 0) return;
                setMoveDialogOpen(true);
              }}
              disabled={moveOptions.length === 0}
              className="chart-card-action p-1 hover:bg-purple-50 rounded text-gray-400 hover:text-purple-600 transition-colors disabled:opacity-40 disabled:pointer-events-none"
              title={moveOptions.length === 0 ? '没有其他标签可移动' : '移到其他标签或标签组'}
            >
              <ArrowRightLeftIcon className="size-3" />
            </button>
          )}
          {isEdit && onRemoveChart && chart.id != null && (
            <button
              type="button"
              onClick={e => {
                e.stopPropagation();
                setRemoveDialogOpen(true);
              }}
              className="chart-card-action p-1 hover:bg-red-50 rounded text-gray-400 hover:text-red-500 transition-colors"
              title="从看板彻底删除该图表"
            >
              <Trash2Icon className="size-3" />
            </button>
          )}
        </div>
      </div>

      <Dialog open={moveDialogOpen} onOpenChange={setMoveDialogOpen}>
        <DialogContent className="sm:max-w-md" showCloseButton>
          <DialogHeader>
            <DialogTitle>移到标签组</DialogTitle>
          </DialogHeader>
          <div className="max-h-64 overflow-y-auto space-y-2 py-1">
            {moveOptions.map(opt => (
              <label
                key={opt.key}
                className="flex cursor-pointer items-center gap-2 rounded-md border border-transparent px-2 py-1.5 text-sm hover:bg-muted/60"
              >
                <input
                  type="radio"
                  name="tab-move-target"
                  className="accent-purple-600"
                  checked={selectedMoveKey === opt.key}
                  onChange={() => setSelectedMoveKey(opt.key)}
                />
                <span>{opt.label}</span>
              </label>
            ))}
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setMoveDialogOpen(false)}>
              取消
            </Button>
            <Button
              type="button"
              disabled={!selectedMoveKey || !chart.id}
              onClick={() => {
                const opt = moveOptions.find(o => o.key === selectedMoveKey);
                if (!opt || !chart.id) return;
                onMoveChartToTab(chart.id, activeTabId, opt.tabGroupId, opt.tabId);
                setMoveDialogOpen(false);
              }}
            >
              确定
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={removeDialogOpen}
        onOpenChange={open => {
          if (!removeSubmitting) setRemoveDialogOpen(open);
        }}
      >
        <DialogContent className="sm:max-w-md" showCloseButton={!removeSubmitting}>
          <DialogHeader>
            <DialogTitle>彻底删除图表</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            将删除「{chart.name}」与看板的关联，并从所有标签组布局中移除。此操作不可恢复。
          </p>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" disabled={removeSubmitting} onClick={() => setRemoveDialogOpen(false)}>
              取消
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={removeSubmitting || chart.id == null}
              onClick={async () => {
                if (chart.id == null || !onRemoveChart) return;
                setRemoveSubmitting(true);
                try {
                  await Promise.resolve(onRemoveChart(chart.id));
                } finally {
                  setRemoveSubmitting(false);
                  setRemoveDialogOpen(false);
                }
              }}
            >
              {removeSubmitting ? '删除中…' : '确定删除'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {!isEdit && hasDynamicControls(chart) && (
        <div className="shrink-0">
          <ChartDynamicControls
            dynamicFilters={chart.dynamicFilters || []}
            dynamicFilterValues={currentDynamicFilterValues}
            onDynamicFilterChange={(field, values) => {
              onDynamicFilterChange(chart.id!, field, values);
            }}
            onRemoveDynamicFilter={field => {
              const newFilterValues = { ...currentDynamicFilterValues };
              delete newFilterValues[field];
              onChartConfigChange(chart.id!, {
                dynamicFilters: chart.dynamicFilters?.filter(f => f.field !== field) || [],
              });
              onDynamicFilterChange(chart.id!, field, []);
            }}
            drilldownConfig={chart.drilldownConfig}
            selectedDrilldownDimensions={currentDrilldownSelections}
            onDrilldownChange={dims => {
              onDrilldownChange(chart.id!, dims);
            }}
            availableFields={allAvailableFields}
            availableDimensions={allAvailableFields.filter(f =>
              chart.drilldownConfig?.dimensions.some(d => d.field === f.name)
            )}
            isEditMode={false}
          />
        </div>
      )}

      <div className="flex-1 min-h-0 p-2 chart-content">
        {isEdit ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-300">
            <ChartTypeIcon type={chart.chartType} />
            <span className="text-xs mt-1">{chart.chartType}</span>
            {hasDynamicControls(chart) && (
              <span className="text-xs text-purple-400 mt-1">
                {(chart.dynamicFilters?.length || 0) > 0 && `${chart.dynamicFilters!.length} 动态过滤`}
                {chart.drilldownConfig?.enabled && ` · 支持下钻`}
              </span>
            )}
          </div>
        ) : isLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="size-5 animate-spin rounded-full border-2 border-gray-200 border-t-blue-400" />
          </div>
        ) : (
          <ChartRenderer
            chartType={chart.chartType}
            data={data}
            dimensions={effectiveDimensions}
            metrics={chart.metrics}
            rtfTextConfig={chart.rtfTextConfig}
          />
        )}
      </div>

      {isEdit && (
        <div
          className="tab-inner-resize-handle absolute bottom-0 right-0 w-4 h-4 cursor-se-resize z-10 bg-gray-200/80 border border-gray-300 rounded-tl"
          title="拖动调整大小"
          onPointerDown={onResizePointerDown}
          onPointerMove={onResizePointerMove}
          onPointerUp={onResizePointerUp}
          onPointerCancel={onResizePointerCancel}
        />
      )}
    </div>
  );
}

function TabGroupTitleEditor({
  storedTitle,
  fallbackLabel,
  onCommit,
}: {
  storedTitle: string;
  fallbackLabel: string;
  onCommit: (title: string) => void;
}): React.JSX.Element {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(storedTitle);

  useEffect(() => {
    if (!editing) setDraft(storedTitle);
  }, [storedTitle, editing]);

  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={() => {
          onCommit(draft);
          setEditing(false);
        }}
        onKeyDown={e => {
          if (e.key === 'Enter') {
            onCommit(draft);
            setEditing(false);
          }
          if (e.key === 'Escape') {
            setDraft(storedTitle);
            setEditing(false);
          }
        }}
        className="chart-card-action px-2 py-0.5 text-sm border border-purple-300 rounded outline-none min-w-0 flex-1 font-semibold text-purple-800 bg-white"
        placeholder={fallbackLabel}
      />
    );
  }

  const isPlaceholder = !storedTitle.trim();
  const shown = storedTitle.trim() || fallbackLabel;

  return (
    <div className="flex items-center gap-0.5 min-w-0 flex-1">
      <span
        className={`chart-card-action text-sm font-semibold truncate min-w-0 flex-1 cursor-default select-none px-1 rounded hover:bg-purple-200/40 ${
          isPlaceholder ? 'text-purple-700/55' : 'text-purple-800'
        }`}
        onDoubleClick={() => {
          setDraft(storedTitle);
          setEditing(true);
        }}
        title="双击或点击铅笔重命名"
      >
        {shown}
      </span>
      <span
        role="button"
        tabIndex={0}
        onClick={() => {
          setDraft(storedTitle);
          setEditing(true);
        }}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setDraft(storedTitle);
            setEditing(true);
          }
        }}
        className="chart-card-action p-0.5 text-gray-400 hover:text-blue-600 cursor-pointer rounded hover:bg-blue-50 shrink-0"
        title="重命名"
      >
        <PencilIcon className="size-3" />
      </span>
    </div>
  );
}

function TabLabel({
  tab,
  isActive,
  isEdit,
  canRemove,
  onSwitch,
  onRemove,
  onRename,
}: {
  tab: TabGroupTab;
  isActive: boolean;
  isEdit: boolean;
  canRemove: boolean;
  onSwitch: () => void;
  onRemove: () => void;
  onRename: (label: string) => void;
}): React.JSX.Element {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(tab.label);

  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={() => {
          onRename(draft);
          setEditing(false);
        }}
        onKeyDown={e => {
          if (e.key === 'Enter') {
            onRename(draft);
            setEditing(false);
          }
          if (e.key === 'Escape') {
            setDraft(tab.label);
            setEditing(false);
          }
        }}
        className="chart-card-action px-1 py-0.5 text-xs border border-purple-300 rounded outline-none w-20"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={onSwitch}
      onDoubleClick={() => {
        if (isEdit) {
          setDraft(tab.label);
          setEditing(true);
        }
      }}
      className={`chart-card-action relative inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors ${
        isActive ? 'text-purple-700' : 'text-gray-500 hover:text-gray-700'
      }`}
    >
      <span className="truncate max-w-[80px]">{tab.label}</span>
      {isActive && (
        <span className="absolute bottom-0 left-1 right-1 h-0.5 bg-purple-500 rounded-full" />
      )}
      {isEdit && (
        <span className="flex items-center gap-1 ml-0.5">
          <span
            onClick={e => {
              e.stopPropagation();
              setDraft(tab.label);
              setEditing(true);
            }}
            className="chart-card-action p-0.5 text-gray-300 hover:text-blue-400 cursor-pointer rounded hover:bg-blue-50"
            title="重命名"
          >
            <PencilIcon className="size-2.5" />
          </span>
          {canRemove && (
            <span
              onClick={e => {
                e.stopPropagation();
                onRemove();
              }}
              className="chart-card-action p-0.5 text-gray-300 hover:text-red-400 cursor-pointer rounded hover:bg-red-50"
              title="删除标签"
            >
              <Trash2Icon className="size-2.5" />
            </span>
          )}
        </span>
      )}
    </button>
  );
}

function ChartTypeIcon({ type }: { type: string }): React.JSX.Element {
  const icons: Record<string, string> = {
    table: '📋',
    line: '📈',
    bar: '📊',
    pie: '🥧',
    number: '#️⃣',
    funnel: '🔻',
    map: '🗺️',
    'rtf-text': '📝',
  };
  return <span className="text-2xl">{icons[type] || '📊'}</span>;
}
