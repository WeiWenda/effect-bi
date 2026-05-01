import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeftIcon, EditIcon, EyeIcon, Trash2Icon, FilterIcon, SaveIcon, PencilIcon, FileTextIcon, LayersIcon, PlusIcon } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { dashboardAPI } from '../../services/dashboardApi';
import { cubeProxyAPI } from '../../services/cubeProxyApi';
import { ChartRenderer } from '../query-explore/ChartRenderer';
import { DashboardFilterConfigPanel } from './DashboardFilterConfigPanel';
import { useToast } from '../ui/toast';
import { ChartDynamicControls } from '../query-explore/ChartDynamicControls';
import { TabGroupContainer } from './TabGroupContainer';
import { TabGroupOrderSidebar } from './TabGroupOrderSidebar';
import { VisualQueryWorkspace } from '../query-explore/VisualQueryWorkspace';
import type { DashboardInfo, ChartConfig, FilterConfig, DashboardLayoutItem, DashboardWidgetType, TabGroupTab, InnerChartLayout } from '../../types/chart';
import {
  migrateLayoutToTabOnly,
  mergeLayoutWithMainStackOrder,
  removeChartIdFromAllTabGroups,
  mainStackIdsInOrder,
  DEFAULT_TAB_GROUP_WIDGET_ID,
} from '../../utils/dashboardTabOnlyLayout';
import { mergeChartAndDashboardFilters } from '../../utils/dashboardFilterBindings';
import { expandFiltersForQuery } from '../../utils/filterTimeRelative';

interface DashboardDetailPageProps {
  dashboardId: number;
  onBack: () => void;
}

export function DashboardDetailPage({ dashboardId, onBack }: DashboardDetailPageProps): React.JSX.Element {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [dashboard, setDashboard] = useState<DashboardInfo | null>(null);
  const [charts, setCharts] = useState<ChartConfig[]>([]);
  const [loading, setLoading] = useState(true);

  const [mode, setMode] = useState<'edit' | 'preview'>('preview');
  const [dashboardFilters, setDashboardFilters] = useState<FilterConfig[]>([]);
  const [layout, setLayout] = useState<DashboardLayoutItem[]>([]);
  const [addChartModal, setAddChartModal] = useState<{ tabGroupId: string; tabId: string } | null>(null);

  const [chartDataMap, setChartDataMap] = useState<Record<number, any[]>>({});
  const [loadingData, setLoadingData] = useState<Set<number>>(new Set());
  
  // 每个图表的动态过滤器运行时值
  const [chartDynamicFilterValues, setChartDynamicFilterValues] = useState<Record<number, Record<string, string[]>>>({});
  // 每个图表的维度下钻选中状态
  const [chartDrilldownSelections, setChartDrilldownSelections] = useState<Record<number, string[]>>({});
  const [highlightChartIds, setHighlightChartIds] = useState<number[]>([]);
  const loadDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const detail = await dashboardAPI.get(dashboardId);
      setDashboard(detail.dashboard);
      setCharts(detail.charts);
      setDashboardFilters(detail.dashboard.filters || []);

      let loadedLayout = detail.dashboard.layout || [];
      const allChartIds = detail.charts.map(c => c.id!).filter(Boolean);
      loadedLayout = migrateLayoutToTabOnly(loadedLayout, allChartIds);
      setLayout(mergeLayoutWithMainStackOrder(loadedLayout, mainStackIdsInOrder(loadedLayout)));
    } catch (err) {
      console.error('Error loading dashboard:', err);
      toast('加载看板失败', 'error');
    } finally {
      setLoading(false);
    }
  }, [dashboardId, toast]);

  useEffect(() => {
    loadDashboard();
  }, [dashboardId, loadDashboard]);

  useEffect(() => {
    if (mode !== 'preview') setHighlightChartIds([]);
  }, [mode]);

  const mainStackOrderIds = useMemo(() => mainStackIdsInOrder(layout), [layout]);

  // Load chart data in preview mode
  useEffect(() => {
    if (mode !== 'preview' || charts.length === 0) return;

    const loadAllChartData = async () => {
      const newLoading = new Set<number>();
      charts.forEach(c => { if (c.id) newLoading.add(c.id); });
      setLoadingData(newLoading);

      for (const chart of charts) {
        if (!chart.id) continue;
        try {
          if (chart.chartType === 'rtf-text' && chart.metrics.length === 0) {
            setChartDataMap(prev => ({ ...prev, [chart.id!]: [{}] }));
            continue;
          }
          const cubeQuery = buildCubeQueryFromChart(
            chart, 
            dashboardFilters,
            chartDynamicFilterValues[chart.id],
            chartDrilldownSelections[chart.id]
          );
          const result = await cubeProxyAPI.load(cubeQuery);
          setChartDataMap(prev => ({
            ...prev,
            [chart.id!]: result.data || [],
          }));
        } catch (err) {
          console.error(`Error loading data for chart ${chart.id}:`, err);
        } finally {
          setLoadingData(prev => {
            const next = new Set(prev);
            next.delete(chart.id!);
            return next;
          });
        }
      }
    };

    loadAllChartData();
  }, [mode, charts, dashboardFilters, chartDynamicFilterValues, chartDrilldownSelections]);

  // 刷新单个图表数据（用于动态过滤器或下钻维度变化时）
  const reloadSingleChart = useCallback(async (
    chartId: number,
    overrideFilterValues?: Record<string, string[]>,
    overrideDrilldownSelections?: string[]
  ) => {
    const chart = charts.find(c => c.id === chartId);
    if (!chart || !chart.id) return;

    setLoadingData(prev => {
      const next = new Set(prev);
      next.add(chartId);
      return next;
    });

    try {
      if (chart.chartType === 'rtf-text' && chart.metrics.length === 0) {
        setChartDataMap(prev => ({ ...prev, [chartId]: [{}] }));
        return;
      }
      // 使用传入的覆盖值或当前状态值
      const dynamicFilterValues = overrideFilterValues ?? chartDynamicFilterValues[chartId];
      const drilldownSelections = overrideDrilldownSelections ?? chartDrilldownSelections[chartId];

      const cubeQuery = buildCubeQueryFromChart(
        chart,
        dashboardFilters,
        dynamicFilterValues,
        drilldownSelections
      );
      const result = await cubeProxyAPI.load(cubeQuery);
      setChartDataMap(prev => ({
        ...prev,
        [chartId]: result.data || [],
      }));
    } catch (err) {
      console.error(`Error reloading chart ${chartId}:`, err);
    } finally {
      setLoadingData(prev => {
        const next = new Set(prev);
        next.delete(chartId);
        return next;
      });
    }
  }, [charts, dashboardFilters, chartDynamicFilterValues, chartDrilldownSelections]);

  const handleAddWidget = useCallback((widgetType: DashboardWidgetType) => {
    setLayout(prev => {
      const maxY = prev.reduce((max, item) => Math.max(max, item.y + item.h), 0);
      const id = `${widgetType}-${Date.now()}`;
      const newItem: DashboardLayoutItem = {
        i: id,
        x: 0,
        y: maxY,
        w: 12,
        h: widgetType === 'filter' ? 2 : widgetType === 'markdown' ? 3 : 5,
        minW: 12,
        maxW: 12,
        minH: widgetType === 'filter' ? 2 : 3,
        widgetType,
        ...(widgetType === 'markdown' ? { markdownContent: '## 标题\n\n在此输入 Markdown 内容...' } : {}),
        ...(widgetType === 'tab-group'
          ? (() => {
              const tabId = `tab-${Date.now()}`;
              return {
                tabGroupTabs: [{ id: tabId, label: '标签 1', chartIds: [] }],
                activeTabId: tabId,
              };
            })()
          : {}),
      };
      const extended = [...prev, newItem];
      return mergeLayoutWithMainStackOrder(extended, mainStackIdsInOrder(extended));
    });
  }, []);

  const handleRemoveWidget = useCallback(
    (widgetId: string) => {
      const target = layout.find(l => l.i === widgetId);
      if (target?.widgetType === 'tab-group') {
        if (target.i === DEFAULT_TAB_GROUP_WIDGET_ID || target.isDefaultTabGroup) {
          toast('不能删除默认标签组', 'error');
          return;
        }
      }
      setLayout(prev => {
        const next = prev.filter(l => l.i !== widgetId);
        const allIds = charts.map(c => c.id!).filter(Boolean);
        const migrated = migrateLayoutToTabOnly(next, allIds);
        return mergeLayoutWithMainStackOrder(migrated, mainStackIdsInOrder(migrated));
      });
    },
    [layout, charts, toast]
  );

  const handleUpdateMarkdown = useCallback((widgetId: string, content: string) => {
    setLayout(prev => prev.map(item =>
      item.i === widgetId ? { ...item, markdownContent: content } : item
    ));
  }, []);

  const handleTabGroupAddTab = useCallback((widgetId: string) => {
    setLayout(prev => prev.map(item => {
      if (item.i !== widgetId || !item.tabGroupTabs) return item;
      const newTab: TabGroupTab = { id: `tab-${Date.now()}`, label: `标签 ${item.tabGroupTabs.length + 1}`, chartIds: [] };
      return { ...item, tabGroupTabs: [...item.tabGroupTabs, newTab], activeTabId: newTab.id };
    }));
  }, []);

  const handleTabGroupSwitchTab = useCallback((widgetId: string, tabId: string) => {
    setLayout(prev => prev.map(item =>
      item.i === widgetId ? { ...item, activeTabId: tabId } : item
    ));
  }, []);

  const handleTabGroupRemoveTab = useCallback((widgetId: string, tabId: string) => {
    setLayout(prev => prev.map(item => {
      if (item.i !== widgetId || !item.tabGroupTabs) return item;
      const newTabs = item.tabGroupTabs.filter(t => t.id !== tabId);
      if (newTabs.length === 0) return item;
      const newActiveId = item.activeTabId === tabId ? newTabs[0].id : item.activeTabId;
      return { ...item, tabGroupTabs: newTabs, activeTabId: newActiveId };
    }));
  }, []);

  const handleTabGroupRenameTab = useCallback((widgetId: string, tabId: string, label: string) => {
    setLayout(prev => prev.map(item => {
      if (item.i !== widgetId || !item.tabGroupTabs) return item;
      return { ...item, tabGroupTabs: item.tabGroupTabs.map(t => t.id === tabId ? { ...t, label } : t) };
    }));
  }, []);

  const handleTabGroupRenameGroup = useCallback((widgetId: string, title: string) => {
    const nextTitle = title.trim();
    setLayout(prev => prev.map(item => {
      if (item.i !== widgetId || item.widgetType !== 'tab-group') return item;
      return { ...item, tabGroupTitle: nextTitle || undefined };
    }));
  }, []);

  const handleMoveChartIntoTabGroup = useCallback((tabGroupId: string, tabId: string, chartId: number) => {
    setLayout(prev => {
      const cleared = removeChartIdFromAllTabGroups(prev, chartId);
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
    });
  }, []);

  // 处理 TabGroup 内部布局变更
  const handleInnerLayoutChange = useCallback((tabGroupId: string, tabId: string, newInnerLayout: InnerChartLayout[]) => {
    setLayout(prev => prev.map(item => {
      if (item.i !== tabGroupId || !item.tabGroupTabs) return item;
      return {
        ...item,
        tabGroupTabs: item.tabGroupTabs.map(tab =>
          tab.id === tabId ? { ...tab, innerLayout: newInnerLayout } : tab
        )
      };
    }));
  }, []);

  const handleSaveLayout = useCallback(async () => {
    if (!dashboard) return;
    try {
      const normalized = mergeLayoutWithMainStackOrder(layout, mainStackOrderIds);
      await dashboardAPI.update(dashboardId, {
        filters: dashboardFilters,
        layout: normalized,
      });
      setLayout(normalized);
      toast('布局保存成功', 'success');
    } catch {
      toast('保存失败', 'error');
    }
  }, [dashboardId, dashboard, dashboardFilters, layout, mainStackOrderIds, toast]);

  const handleToggleMode = () => {
    if (mode === 'edit') {
      setMode('preview');
    } else {
      setMode('edit');
    }
  };

  const handleEditChart = (chartId: number) => {
    navigate(`/query?chartId=${chartId}`);
  };

  const handleRemoveChart = async (chartId: number) => {
    try {
      await dashboardAPI.removeChart(dashboardId, chartId);
      const nextCharts = charts.filter(c => c.id !== chartId);
      setCharts(nextCharts);
      setLayout(prev => {
        const stripped = removeChartIdFromAllTabGroups(prev, chartId);
        const migrated = migrateLayoutToTabOnly(
          stripped,
          nextCharts.map(c => c.id!).filter(Boolean)
        );
        return mergeLayoutWithMainStackOrder(migrated, mainStackIdsInOrder(migrated));
      });
      toast('已移除图表', 'success');
    } catch {
      toast('移除失败', 'error');
    }
  };


  const handleDashboardFilterChange = (filters: FilterConfig[]) => {
    setDashboardFilters(filters);
  };

  // Build available fields for dashboard-level filters from all charts
  const allAvailableFields = useMemo(() => {
    const fieldMap = new Map<string, { name: string; title: string; type: string }>();
    for (const chart of charts) {
      for (const dim of chart.dimensions) {
        if (!fieldMap.has(dim.field)) {
          fieldMap.set(dim.field, { name: dim.field, title: dim.title || dim.field, type: dim.type || 'string' });
        }
      }
      for (const met of chart.metrics) {
        if (!fieldMap.has(met.field)) {
          fieldMap.set(met.field, { name: met.field, title: met.title || met.field, type: met.type || 'number' });
        }
      }
    }
    return Array.from(fieldMap.values());
  }, [charts]);

  const stackItems = useMemo(() => {
    const map = new Map(layout.map(l => [l.i, l]));
    return mainStackOrderIds.map(id => map.get(id)).filter(Boolean) as DashboardLayoutItem[];
  }, [layout, mainStackOrderIds]);

  const tabGroupRelocationTargets = useMemo(() => {
    const tabGroups = layout.filter(l => l.widgetType === 'tab-group' && l.tabGroupTabs?.length);
    return tabGroups.map((l, index) => ({
      tabGroupId: l.i,
      tabGroupLabel:
        l.tabGroupTitle?.trim() ||
        (l.isDefaultTabGroup ? '默认标签组' : `标签组 ${index + 1}`),
      tabs: (l.tabGroupTabs || []).map(t => ({ id: t.id, label: t.label })),
    }));
  }, [layout]);

  if (loading || !dashboard) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="size-8 animate-spin rounded-full border-2 border-gray-300 border-t-blue-500" />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-200 bg-white shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-1.5 rounded-md hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition-colors"
          >
            <ChevronLeftIcon className="size-5" />
          </button>
          <h1 className="text-lg font-semibold text-gray-800">{dashboard.name}</h1>
          <span className={`text-xs px-2 py-0.5 rounded ${mode === 'edit' ? 'bg-orange-100 text-orange-700' : 'bg-green-100 text-green-700'}`}>
            {mode === 'edit' ? '编辑模式' : '预览模式'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {mode === 'edit' && (
            <>
              <div className="flex items-center gap-1 px-2 py-1 bg-gray-100 rounded-md">
                <button
                  onClick={() => handleAddWidget('filter')}
                  className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                  title="添加看板筛选器"
                >
                  <FilterIcon className="size-3.5" />
                  筛选器
                </button>
                <button
                  onClick={() => handleAddWidget('tab-group')}
                  className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-gray-600 hover:text-purple-600 hover:bg-purple-50 rounded transition-colors"
                  title="添加图表标签组容器"
                >
                  <LayersIcon className="size-3.5" />
                  标签组
                </button>
              </div>
              <button
                onClick={handleSaveLayout}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-500 text-white rounded-md text-sm font-medium hover:bg-blue-600 transition-colors"
              >
                <SaveIcon className="size-4" />
                保存布局
              </button>
            </>
          )}
          <button
            onClick={handleToggleMode}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              mode === 'edit'
                ? 'bg-green-500 text-white hover:bg-green-600'
                : 'bg-orange-500 text-white hover:bg-orange-600'
            }`}
          >
            {mode === 'edit' ? <EyeIcon className="size-4" /> : <EditIcon className="size-4" />}
            {mode === 'edit' ? '预览' : '编辑'}
          </button>
        </div>
      </div>

      <div className="flex-1 flex min-h-0 overflow-hidden">
        <div className="flex-1 overflow-auto p-4 min-w-0">
          {stackItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-400">
              <LayoutDashboardIcon className="size-12 mb-3" />
              <p className="text-sm">暂无内容</p>
              <p className="text-xs text-gray-400 mt-2">从查询页 Pin 图表到看板</p>
            </div>
          ) : (
            <div className="flex flex-col gap-4 w-full max-w-6xl mx-auto">
              {stackItems.map(item => {
                if (item.widgetType === 'filter') {
                  return (
                    <div key={item.i} className="w-full bg-white rounded-lg border border-blue-200 shadow-sm overflow-hidden flex flex-col">
                      <div className="flex items-center justify-between px-3 py-1.5 border-b border-blue-100 bg-blue-50/50 shrink-0">
                        <div className="flex items-center gap-1.5">
                          <FilterIcon className="size-3.5 text-blue-500" />
                          <span className="text-xs font-medium text-blue-700">看板筛选器</span>
                        </div>
                        {mode === 'edit' && (
                          <button
                            type="button"
                            onClick={() => handleRemoveWidget(item.i)}
                            className="chart-card-action p-1 hover:bg-red-50 rounded text-gray-400 hover:text-red-500 transition-colors"
                            title="移除筛选器"
                          >
                            <Trash2Icon className="size-3" />
                          </button>
                        )}
                      </div>
                      <div className="flex-1 p-2 min-h-0 overflow-auto">
                        <DashboardFilterConfigPanel
                          filters={dashboardFilters}
                          onChange={handleDashboardFilterChange}
                          charts={charts}
                          layout={layout}
                          mode={mode}
                          onHighlightCharts={setHighlightChartIds}
                        />
                      </div>
                    </div>
                  );
                }

                if (item.widgetType === 'markdown') {
                  return (
                    <div key={item.i} className="w-full bg-white rounded-lg border border-green-200 shadow-sm overflow-hidden flex flex-col">
                      {mode === 'edit' && (
                        <div className="flex items-center justify-between px-3 py-1.5 border-b border-green-100 bg-green-50/50 shrink-0">
                          <div className="flex items-center gap-1.5">
                            <FileTextIcon className="size-3.5 text-green-500" />
                            <span className="text-xs font-medium text-green-700">Markdown</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleRemoveWidget(item.i)}
                            className="chart-card-action p-1 hover:bg-red-50 rounded text-gray-400 hover:text-red-500 transition-colors"
                            title="移除 Markdown"
                          >
                            <Trash2Icon className="size-3" />
                          </button>
                        </div>
                      )}
                      <div className="p-3">
                        {mode === 'edit' ? (
                          <textarea
                            value={item.markdownContent || ''}
                            onChange={e => handleUpdateMarkdown(item.i, e.target.value)}
                            className="w-full min-h-[80px] text-sm border border-gray-200 rounded p-2 font-mono resize-none focus:outline-none focus:ring-1 focus:ring-green-400"
                            placeholder="输入 Markdown 内容..."
                          />
                        ) : (
                          <div className="prose prose-sm max-w-none text-gray-700">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                              {item.markdownContent || ''}
                            </ReactMarkdown>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                }

                if (item.widgetType === 'tab-group') {
                  return (
                    <div key={item.i} className="w-full">
                      <TabGroupContainer
                        item={item}
                        charts={charts}
                        mode={mode}
                        chartDataMap={chartDataMap}
                        loadingData={loadingData}
                        onRemoveWidget={() => handleRemoveWidget(item.i)}
                        onAddTab={() => handleTabGroupAddTab(item.i)}
                        onSwitchTab={(tabId: string) => handleTabGroupSwitchTab(item.i, tabId)}
                        onRemoveTab={(tabId: string) => handleTabGroupRemoveTab(item.i, tabId)}
                        onRenameTab={(tabId: string, label: string) => handleTabGroupRenameTab(item.i, tabId, label)}
                        onRenameGroup={title => handleTabGroupRenameGroup(item.i, title)}
                        relocationTargets={tabGroupRelocationTargets}
                        onMoveChartToTab={(chartId, _fromTabId, toTabGroupId, toTabId) =>
                          handleMoveChartIntoTabGroup(toTabGroupId, toTabId, chartId)
                        }
                        onOpenAddChart={tabId => setAddChartModal({ tabGroupId: item.i, tabId })}
                        onInnerLayoutChange={(tabId: string, newLayout: InnerChartLayout[]) =>
                          handleInnerLayoutChange(item.i, tabId, newLayout)
                        }
                        chartDynamicFilterValues={chartDynamicFilterValues}
                        chartDrilldownSelections={chartDrilldownSelections}
                        onDynamicFilterChange={(chartId, field, values) => {
                          const currentFilterValues = chartDynamicFilterValues[chartId] || {};
                          const newFilterValues = { ...currentFilterValues, [field]: values };
                          setChartDynamicFilterValues(prev => ({
                            ...prev,
                            [chartId]: newFilterValues,
                          }));
                          reloadSingleChart(chartId, newFilterValues, chartDrilldownSelections[chartId]);
                        }}
                        onDrilldownChange={(chartId, dimensions) => {
                          setChartDrilldownSelections(prev => ({
                            ...prev,
                            [chartId]: dimensions,
                          }));
                          reloadSingleChart(chartId, chartDynamicFilterValues[chartId], dimensions);
                        }}
                        onChartConfigChange={(chartId, newConfig) => {
                          setCharts(prev => prev.map(c => (c.id === chartId ? { ...c, ...newConfig } : c)));
                        }}
                        onRemoveChart={handleRemoveChart}
                        allAvailableFields={allAvailableFields}
                        highlightChartIds={highlightChartIds}
                      />
                    </div>
                  );
                }

                return null;
              })}
            </div>
          )}
        </div>
        {mode === 'edit' && (
          <TabGroupOrderSidebar
            layout={layout}
            stackOrderIds={mainStackOrderIds}
            onReorder={next => setLayout(prev => mergeLayoutWithMainStackOrder(prev, next))}
          />
        )}
      </div>

      {addChartModal && (
        <div className="fixed inset-0 z-[100] flex flex-col bg-white">
          <VisualQueryWorkspace
            key={`${addChartModal.tabGroupId}-${addChartModal.tabId}`}
            variant="embed"
            embed={{
              dashboardId,
              sourceTabGroupId: addChartModal.tabGroupId,
              sourceTabId: addChartModal.tabId,
              onCancel: () => setAddChartModal(null),
              onAdded: () => loadDashboard(),
            }}
          />
        </div>
      )}
    </div>
  );
}

function buildCubeQueryFromChart(
  chart: ChartConfig, 
  dashboardFilters: FilterConfig[],
  dynamicFilterValues?: Record<string, string[]>,
  drilldownSelections?: string[]
) {
  const effectiveFilters = expandFiltersForQuery(
    mergeChartAndDashboardFilters(chart, chart.filters, dashboardFilters)
  );

  // 添加动态过滤器
  if (dynamicFilterValues) {
    for (const [field, values] of Object.entries(dynamicFilterValues)) {
      if (values.length > 0) {
        effectiveFilters.push({
          field,
          operator: 'in',
          values,
        });
      }
    }
  }
  
  const query = {
    measures: chart.metrics.map(m => m.field),
    dimensions: [] as string[],
    timeDimensions: [] as any[],
    filters: effectiveFilters.map(f => ({ member: f.field, operator: f.operator, values: f.values })),
    order: chart.sort.map(s => [s.field, s.direction] as [string, 'asc' | 'desc']),
    limit: chart.limit || 500,
  };

  // 基础维度
  for (const dim of chart.dimensions) {
    if (dim.timeGranularity) {
      query.timeDimensions.push({ dimension: dim.field, granularity: dim.timeGranularity });
    } else {
      query.dimensions.push(dim.field);
    }
  }
  
  // 下钻维度（文本图无维度）
  if (
    chart.chartType !== 'rtf-text' &&
    chart.drilldownConfig?.enabled &&
    drilldownSelections &&
    drilldownSelections.length > 0
  ) {
    for (const dim of chart.drilldownConfig.dimensions) {
      if (drilldownSelections.includes(dim.field)) {
        if (dim.timeGranularity) {
          query.timeDimensions.push({ dimension: dim.field, granularity: dim.timeGranularity });
        } else {
          query.dimensions.push(dim.field);
        }
      }
    }
  }

  return query;
}

function LayoutDashboardIcon(props: any) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect width="7" height="7" x="3" y="3" rx="1" />
      <rect width="7" height="7" x="14" y="3" rx="1" />
      <rect width="7" height="7" x="14" y="14" rx="1" />
      <rect width="7" height="7" x="3" y="14" rx="1" />
    </svg>
  );
}
