import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeftIcon, EditIcon, EyeIcon, Trash2Icon, FilterIcon, SaveIcon, PencilIcon, FileTextIcon, LayersIcon, PlusIcon } from 'lucide-react';
import ReactGridLayout from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { dashboardAPI } from '../../services/dashboardApi';
import { cubeProxyAPI } from '../../services/cubeProxyApi';
import { ChartRenderer } from '../query-explore/ChartRenderer';
import { FilterConfigPanel } from '../query-explore/FilterConfigPanel';
import { useToast } from '../ui/toast';
import { ChartDynamicControls } from '../query-explore/ChartDynamicControls';
import type { DashboardInfo, ChartConfig, FilterConfig, DashboardLayoutItem, DashboardWidgetType, TabGroupTab } from '../../types/chart';

interface DashboardDetailPageProps {
  dashboardId: number;
  onBack: () => void;
}

function mergeFilters(chartFilters: FilterConfig[], dashboardFilters: FilterConfig[]): FilterConfig[] {
  const dashboardFieldSet = new Set(dashboardFilters.map(f => f.field));
  return [
    ...chartFilters.filter(f => !dashboardFieldSet.has(f.field)),
    ...dashboardFilters,
  ];
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

  const [chartDataMap, setChartDataMap] = useState<Record<number, any[]>>({});
  const [loadingData, setLoadingData] = useState<Set<number>>(new Set());
  
  // 每个图表的动态过滤器运行时值
  const [chartDynamicFilterValues, setChartDynamicFilterValues] = useState<Record<number, Record<string, string[]>>>({});
  // 每个图表的维度下钻选中状态
  const [chartDrilldownSelections, setChartDrilldownSelections] = useState<Record<number, string[]>>({});

  const COLS = 12;
  const ROW_HEIGHT = 80;

  useEffect(() => {
    loadDashboard();
  }, [dashboardId]);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const detail = await dashboardAPI.get(dashboardId);
      setDashboard(detail.dashboard);
      setCharts(detail.charts);
      setDashboardFilters(detail.dashboard.filters || []);

      // 处理 layout：确保所有图表都有对应的 layout item
      let loadedLayout = detail.dashboard.layout || [];

      // 获取所有 TabGroup 的 ID 和其中的图表
      const tabGroups = loadedLayout.filter(item => item.widgetType === 'tab-group');
      const tabGroupIds = new Set(tabGroups.map(item => item.i));
      
      // 收集所有在 TabGroup 中的图表ID
      const chartsInTabGroups = new Map<string, string>(); // chartId -> belongsTo
      tabGroups.forEach(tabGroup => {
        if (tabGroup.tabGroupTabs) {
          tabGroup.tabGroupTabs.forEach(tab => {
            tab.chartIds.forEach(chartId => {
              chartsInTabGroups.set(String(chartId), `${tabGroup.i}:${tab.id}`);
            });
          });
        }
      });

      // 清理孤立的 belongsTo 标记（对应的 TabGroup 不存在）
      // 同时为在 TabGroup 中的图表添加 belongsTo 标记
      loadedLayout = loadedLayout.map(item => {
        // 清理孤立的 belongsTo 标记
        if (item.belongsTo) {
          const [tabGroupId] = item.belongsTo.split(':');
          if (!tabGroupIds.has(tabGroupId)) {
            const { belongsTo, ...rest } = item;
            return rest;
          }
        }
        
        // 为在 TabGroup 中的图表添加 belongsTo 标记
        if (chartsInTabGroups.has(item.i)) {
          return { ...item, belongsTo: chartsInTabGroups.get(item.i) };
        }
        
        return item;
      });

      // Check for missing charts AFTER belongsTo processing
      // Only consider charts that don't have belongsTo as missing
      const layoutChartIds = new Set(
        loadedLayout
          .filter(item => !item.widgetType && !item.belongsTo)
          .map(item => parseInt(item.i))
      );
      const missingCharts = detail.charts.filter(c => c.id && !layoutChartIds.has(c.id));

      if (missingCharts.length > 0) {
        // 为缺失的图表创建 layout items
        const maxY = loadedLayout.length > 0 ? Math.max(...loadedLayout.map(item => item.y + item.h)) : 0;
        const newLayoutItems: DashboardLayoutItem[] = missingCharts.map((chart, idx) => ({
          i: String(chart.id),
          x: (idx * 6) % COLS,
          y: maxY + Math.floor(idx * 6 / COLS),
          w: 6,
          h: 4,
          minW: 3,
          minH: 2,
        }));
        loadedLayout = [...loadedLayout, ...newLayoutItems];
      }

      setLayout(loadedLayout);

      // Auto-generate layout if completely empty
      if (loadedLayout.length === 0 && detail.charts.length > 0) {
        const autoLayout: DashboardLayoutItem[] = detail.charts.map((chart, idx) => ({
          i: String(chart.id),
          x: (idx * 6) % COLS,
          y: Math.floor(idx * 6 / COLS),
          w: 6,
          h: 4,
          minW: 3,
          minH: 2,
        }));
        setLayout(autoLayout);
      }
    } catch (err) {
      console.error('Error loading dashboard:', err);
      toast('加载看板失败', 'error');
    } finally {
      setLoading(false);
    }
  }, [dashboardId, toast]);

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

  const handleLayoutChange = useCallback((newLayout: any) => {
    const items = Array.isArray(newLayout) ? newLayout : [newLayout];
    setLayout(prev => {
      const prevMap = new Map(prev.map(item => [item.i, item]));
      const newItems: DashboardLayoutItem[] = items.map((item: any) => {
        const prevItem = prevMap.get(item.i);
        return {
          i: item.i,
          x: item.x,
          y: item.y,
          w: item.w,
          h: item.h,
          minW: item.minW,
          minH: item.minH,
          widgetType: prevItem?.widgetType,
          markdownContent: prevItem?.markdownContent,
          tabGroupTabs: prevItem?.tabGroupTabs,
          activeTabId: prevItem?.activeTabId,
        };
      });
      return newItems;
    });
  }, []);

  const handleAddWidget = useCallback((widgetType: DashboardWidgetType) => {
    const id = `${widgetType}-${Date.now()}`;
    const maxY = layout.reduce((max, item) => Math.max(max, item.y + item.h), 0);
    
    const newItem: DashboardLayoutItem = {
      i: id,
      x: 0,
      y: maxY,
      w: widgetType === 'filter' ? 12 : widgetType === 'tab-group' ? 12 : 6,
      h: widgetType === 'filter' ? 2 : widgetType === 'markdown' ? 3 : widgetType === 'tab-group' ? 5 : 4,
      minW: widgetType === 'filter' ? 6 : 3,
      minH: widgetType === 'filter' ? 2 : 3,
      widgetType,
      ...(widgetType === 'markdown' ? { markdownContent: '## 标题\n\n在此输入 Markdown 内容...' } : {}),
      ...(widgetType === 'tab-group' ? (() => {
        const tabId = `tab-${Date.now()}`;
        return {
          tabGroupTabs: [{ id: tabId, label: '标签 1', chartIds: [] }],
          activeTabId: tabId
        };
      })() : {}),
    };
    setLayout(prev => [...prev, newItem]);
  }, [layout]);

  const handleRemoveWidget = useCallback((widgetId: string) => {
    setLayout(prev => prev.filter(l => l.i !== widgetId));
  }, []);

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

  // 将图表移入 TabGroup
  const handleMoveChartIntoTabGroup = useCallback((tabGroupId: string, tabId: string, chartId: number) => {
    setLayout(prev => {
      // 1. 更新 TabGroup，添加 chartId
      const newLayout = prev.map(item => {
        if (item.i !== tabGroupId || !item.tabGroupTabs) return item;
        return {
          ...item,
          tabGroupTabs: item.tabGroupTabs.map(t =>
            t.id === tabId && !t.chartIds.includes(chartId)
              ? { ...t, chartIds: [...t.chartIds, chartId] }
              : t
          )
        };
      });

      // 2. 标记图表为已归属（添加 belongsTo 字段）
      return newLayout.map(item => {
        if (item.i === String(chartId)) {
          return { ...item, belongsTo: `${tabGroupId}:${tabId}` };
        }
        return item;
      });
    });
  }, []);

  // 将图表移出 TabGroup
  const handleMoveChartOutOfTabGroup = useCallback((tabGroupId: string, tabId: string, chartId: number) => {
    setLayout(prev => {
      // 1. 从 TabGroup 移除 chartId
      const newLayout = prev.map(item => {
        if (item.i !== tabGroupId || !item.tabGroupTabs) return item;
        return {
          ...item,
          tabGroupTabs: item.tabGroupTabs.map(t =>
            t.id === tabId ? { ...t, chartIds: t.chartIds.filter(id => id !== chartId) } : t
          )
        };
      });

      // 2. 移除图表的 belongsTo 标记
      return newLayout.map(item => {
        if (item.i === String(chartId)) {
          const { belongsTo, ...rest } = item;
          return rest;
        }
        return item;
      });
    });
  }, []);

  const handleSaveLayout = useCallback(async () => {
    if (!dashboard) return;
    try {
      await dashboardAPI.update(dashboardId, {
        filters: dashboardFilters,
        layout,
      });
      toast('布局保存成功', 'success');
    } catch {
      toast('保存失败', 'error');
    }
  }, [dashboardId, dashboard, dashboardFilters, layout, toast]);

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
      setCharts(prev => prev.filter(c => c.id !== chartId));
      setLayout(prev => prev.filter(l => l.i !== String(chartId)));
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
                  onClick={() => handleAddWidget('markdown')}
                  className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-gray-600 hover:text-green-600 hover:bg-green-50 rounded transition-colors"
                  title="添加 Markdown 描述块"
                >
                  <FileTextIcon className="size-3.5" />
                  Markdown
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

      {/* Grid Content */}
      <div className="flex-1 overflow-auto p-4">
        {layout.length === 0 && charts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-400">
            <LayoutDashboardIcon className="size-12 mb-3" />
            <p className="text-sm">暂无内容</p>
            <p className="text-xs text-gray-400 mt-2">从查询页 Pin 图表到看板，或使用工具栏添加组件</p>
          </div>
        ) : (
          <ReactGridLayout
            layout={layout.map(item => ({ ...item }))}
            width={1200}
            gridConfig={{ cols: COLS, rowHeight: ROW_HEIGHT, margin: [10, 10], containerPadding: [0, 0], maxRows: Infinity }}
            dragConfig={{ enabled: mode === 'edit', cancel: '.chart-card-action', bounded: false, threshold: 3 }}
            resizeConfig={{ enabled: mode === 'edit', handles: ['se'] }}
            onLayoutChange={handleLayoutChange}
          >
            {layout.map(item => {
              // Chart widget (no explicit widgetType or widgetType === 'chart')
              // 跳过属于 TabGroup 的图表（有 belongsTo 字段）
              // Also check if this chart ID is in any tab group to be extra safe
              const isInTabGroup = (() => {
                const chartId = parseInt(item.i);
                return layout.some(layoutItem => 
                  layoutItem.widgetType === 'tab-group' && 
                  layoutItem.tabGroupTabs?.some(tab => tab.chartIds.includes(chartId))
                );
              })();
              
              if ((!item.widgetType || item.widgetType === 'chart') && !item.belongsTo && !isInTabGroup) {
                const chartId = parseInt(item.i);
                const chart = charts.find(c => c.id === chartId);
                if (!chart) return null;

                const data = chartDataMap[chart.id!] || [];
                const isLoading = loadingData.has(chart.id!);

                // 获取图表的动态过滤器和下钻配置
                const hasDynamicControls = (chart.dynamicFilters && chart.dynamicFilters.length > 0) || 
                  chart.drilldownConfig?.enabled;
                const currentDynamicFilterValues = chartDynamicFilterValues[chart.id!] || {};
                const currentDrilldownSelections = chartDrilldownSelections[chart.id!] || 
                  (chart.drilldownConfig?.defaultSelected ?? []);
                
                // 合并基础维度和下钻维度用于渲染
                const effectiveDimensions = [...chart.dimensions];
                if (chart.drilldownConfig?.enabled && currentDrilldownSelections.length > 0) {
                  for (const dim of chart.drilldownConfig.dimensions) {
                    if (currentDrilldownSelections.includes(dim.field) && 
                        !effectiveDimensions.some(d => d.field === dim.field)) {
                      effectiveDimensions.push(dim);
                    }
                  }
                }

                return (
                  <div key={item.i} className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden flex flex-col">
                    <div className="flex items-center justify-between px-3 py-1.5 border-b border-gray-100 bg-gray-50/50 shrink-0">
                      <span className="text-xs font-medium text-gray-600 truncate">{chart.name}</span>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={(e) => { e.stopPropagation(); handleEditChart(chart.id!); }}
                          className="chart-card-action p-1 hover:bg-gray-100 rounded text-gray-400 hover:text-blue-500 transition-colors"
                          title="编辑图表"
                        >
                          <PencilIcon className="size-3" />
                        </button>
                        {mode === 'edit' && (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleRemoveChart(chart.id!); }}
                            className="chart-card-action p-1 hover:bg-red-50 rounded text-gray-400 hover:text-red-500 transition-colors"
                            title="移除图表"
                          >
                            <Trash2Icon className="size-3" />
                          </button>
                        )}
                      </div>
                    </div>
                    
                    {/* 动态过滤器与下钻控件 */}
                    {mode === 'preview' && hasDynamicControls && (
                      <ChartDynamicControls
                        dynamicFilters={chart.dynamicFilters || []}
                        dynamicFilterValues={currentDynamicFilterValues}
                        onDynamicFilterChange={(field, values) => {
                          // 先计算新的过滤器值
                          const newFilterValues = { ...currentDynamicFilterValues, [field]: values };
                          setChartDynamicFilterValues(prev => ({
                            ...prev,
                            [chart.id!]: newFilterValues
                          }));
                          // 使用新值立即刷新该图表数据
                          reloadSingleChart(chart.id!, newFilterValues, currentDrilldownSelections);
                        }}
                        onRemoveDynamicFilter={(field) => {
                          // 从图表配置中移除动态过滤器
                          const updatedChart = {
                            ...chart,
                            dynamicFilters: chart.dynamicFilters?.filter(f => f.field !== field) || []
                          };
                          setCharts(prev => prev.map(c => c.id === chart.id ? updatedChart : c));
                          // 从当前值中移除该过滤器
                          const newFilterValues = { ...currentDynamicFilterValues };
                          delete newFilterValues[field];
                          setChartDynamicFilterValues(prev => ({
                            ...prev,
                            [chart.id!]: newFilterValues
                          }));
                          // 刷新图表数据
                          reloadSingleChart(chart.id!, newFilterValues, currentDrilldownSelections);
                        }}
                        drilldownConfig={chart.drilldownConfig}
                        selectedDrilldownDimensions={currentDrilldownSelections}
                        onDrilldownChange={(dims) => {
                          setChartDrilldownSelections(prev => ({
                            ...prev,
                            [chart.id!]: dims
                          }));
                          // 使用新值立即刷新该图表数据
                          reloadSingleChart(chart.id!, currentDynamicFilterValues, dims);
                        }}
                        availableFields={allAvailableFields}
                        availableDimensions={allAvailableFields.filter(f => 
                          chart.drilldownConfig?.dimensions.some(d => d.field === f.name)
                        )}
                        isEditMode={false}
                      />
                    )}
                    
                    <div className="flex-1 p-2 min-h-0">
                      {mode === 'edit' ? (
                        <div className="flex flex-col items-center justify-center h-full text-gray-300">
                          <ChartTypeIcon type={chart.chartType} />
                          <span className="text-xs mt-1">{chart.chartType}</span>
                          <span className="text-xs text-gray-400 mt-0.5">
                            {chart.dimensions.length} 维度 / {chart.metrics.length} 指标
                          </span>
                          {hasDynamicControls && (
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
                        />
                      )}
                    </div>
                  </div>
                );
              }

              // Filter widget
              if (item.widgetType === 'filter') {
                return (
                  <div key={item.i} className="bg-white rounded-lg border border-blue-200 shadow-sm overflow-hidden flex flex-col">
                    <div className="flex items-center justify-between px-3 py-1.5 border-b border-blue-100 bg-blue-50/50 shrink-0">
                      <div className="flex items-center gap-1.5">
                        <FilterIcon className="size-3.5 text-blue-500" />
                        <span className="text-xs font-medium text-blue-700">看板筛选器</span>
                      </div>
                      {mode === 'edit' && (
                        <button
                          onClick={() => handleRemoveWidget(item.i)}
                          className="chart-card-action p-1 hover:bg-red-50 rounded text-gray-400 hover:text-red-500 transition-colors"
                          title="移除筛选器"
                        >
                          <Trash2Icon className="size-3" />
                        </button>
                      )}
                    </div>
                    <div className="flex-1 p-2 min-h-0 overflow-auto">
                      <FilterConfigPanel
                        filters={dashboardFilters}
                        onChange={handleDashboardFilterChange}
                        availableFields={allAvailableFields}
                      />
                    </div>
                  </div>
                );
              }

              // Markdown widget
              if (item.widgetType === 'markdown') {
                return (
                  <div key={item.i} className="bg-white rounded-lg border border-green-200 shadow-sm overflow-hidden flex flex-col">
                    {mode === 'edit' && (
                      <div className="flex items-center justify-between px-3 py-1.5 border-b border-green-100 bg-green-50/50 shrink-0">
                        <div className="flex items-center gap-1.5">
                          <FileTextIcon className="size-3.5 text-green-500" />
                          <span className="text-xs font-medium text-green-700">Markdown</span>
                        </div>
                        <button
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

              // Tab-group widget
              if (item.widgetType === 'tab-group') {
                return (
                  <TabGroupContainer
                    key={item.i}
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
                    onMoveChartIntoTab={(chartId: number, tabId: string) => handleMoveChartIntoTabGroup(item.i, tabId, chartId)}
                    onMoveChartOutOfTab={(chartId: number, tabId: string) => handleMoveChartOutOfTabGroup(item.i, tabId, chartId)}
                    chartDynamicFilterValues={chartDynamicFilterValues}
                    chartDrilldownSelections={chartDrilldownSelections}
                    onDynamicFilterChange={(chartId, field, values) => {
                      const currentFilterValues = chartDynamicFilterValues[chartId] || {};
                      const newFilterValues = { ...currentFilterValues, [field]: values };
                      setChartDynamicFilterValues(prev => ({
                        ...prev,
                        [chartId]: newFilterValues
                      }));
                      reloadSingleChart(chartId, newFilterValues, chartDrilldownSelections[chartId]);
                    }}
                    onDrilldownChange={(chartId, dimensions) => {
                      setChartDrilldownSelections(prev => ({
                        ...prev,
                        [chartId]: dimensions
                      }));
                      reloadSingleChart(chartId, chartDynamicFilterValues[chartId], dimensions);
                    }}
                    onChartConfigChange={(chartId, newConfig) => {
                      setCharts(prev => prev.map(c => c.id === chartId ? { ...c, ...newConfig } : c));
                    }}
                    allAvailableFields={allAvailableFields}
                  />
                );
              }

              return null;
            })}
          </ReactGridLayout>
        )}
      </div>

    </div>
  );
}

function ChartTypeIcon({ type }: { type: string }): React.JSX.Element {
  const icons: Record<string, string> = {
    table: '📋',
    line: '📈',
    bar: '📊',
    pie: '🥧',
    number: '#️⃣',
  };
  return <span className="text-2xl">{icons[type] || '📊'}</span>;
}

// TabGroup 容器组件
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
  onMoveChartIntoTab: (chartId: number, tabId: string) => void;
  onMoveChartOutOfTab: (chartId: number, tabId: string) => void;
  // 动态控件相关
  chartDynamicFilterValues: Record<number, Record<string, string[]>>;
  chartDrilldownSelections: Record<number, string[]>;
  onDynamicFilterChange: (chartId: number, field: string, values: string[]) => void;
  onDrilldownChange: (chartId: number, dimensions: string[]) => void;
  onChartConfigChange: (chartId: number, newConfig: Partial<ChartConfig>) => void;
  allAvailableFields: { name: string; title: string; type: string }[];
}

function TabGroupContainer({
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
  onMoveChartIntoTab,
  onMoveChartOutOfTab,
  chartDynamicFilterValues,
  chartDrilldownSelections,
  onDynamicFilterChange,
  onDrilldownChange,
  onChartConfigChange,
  allAvailableFields,
}: TabGroupContainerProps): React.JSX.Element {
  const tabs = item.tabGroupTabs || [];
  const activeTab = tabs.find(t => t.id === item.activeTabId) || tabs[0];
  const isEdit = mode === 'edit';

  // 获取所有未归属到当前 TabGroup 当前标签的图表（可以在编辑模式下移入）
  const availableCharts = charts.filter(c => 
    c.id && !activeTab?.chartIds.includes(c.id)
  );

  return (
    <div
      className="bg-white rounded-lg border-2 border-purple-300 shadow-md overflow-hidden flex flex-col transition-all duration-200"
    >
      {/* 标题栏 */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-purple-200 bg-purple-100 shrink-0">
        <div className="flex items-center gap-1.5">
          <LayersIcon className="size-4 text-purple-600" />
          <span className="text-sm font-semibold text-purple-800">标签组</span>
        </div>
        {isEdit && (
          <button
            onClick={onRemoveWidget}
            className="chart-card-action p-1 hover:bg-red-100 rounded text-gray-500 hover:text-red-600 transition-colors"
            title="移除标签组"
          >
            <Trash2Icon className="size-3.5" />
          </button>
        )}
      </div>

      {/* 标签栏 */}
      <div className="flex items-center border-b border-purple-100 px-2 py-1 shrink-0 overflow-x-auto bg-purple-50/30">
        {tabs.map(tab => (
          <TabLabel
            key={tab.id}
            tab={tab}
            isActive={tab.id === (activeTab?.id)}
            isEdit={isEdit}
            canRemove={tabs.length > 1}
            onSwitch={() => onSwitchTab(tab.id)}
            onRemove={() => onRemoveTab(tab.id)}
            onRename={(label) => onRenameTab(tab.id, label)}
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

      {/* 标签内容 - 图表网格 */}
      <div className="p-3 bg-gray-50/30">
        {activeTab ? (
          <div className="space-y-3">
            {/* 编辑模式：显示可移入的图表 */}
            {isEdit && availableCharts.length > 0 && (
              <div className="flex flex-wrap gap-2 p-2 bg-white rounded border border-dashed border-purple-200">
                <span className="text-xs text-gray-500 w-full mb-1">可拖拽到此处：</span>
                {availableCharts.map(c => (
                  <button
                    key={c.id}
                    onClick={() => c.id && onMoveChartIntoTab(c.id, activeTab.id)}
                    className="chart-card-action flex items-center gap-1 px-2 py-1 text-xs bg-purple-50 border border-purple-200 rounded hover:bg-purple-100 transition-colors"
                    title={`将 "${c.name}" 移入此标签`}
                  >
                    <PlusIcon className="size-3" />
                    {c.name}
                  </button>
                ))}
              </div>
            )}

            {/* 图表网格 */}
            {activeTab.chartIds.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-32 text-gray-400 border-2 border-dashed border-gray-200 rounded-lg">
                <LayersIcon className="size-8 mb-2" />
                <span className="text-xs">{isEdit ? '点击上方按钮或拖拽图表到此处' : '暂无图表'}</span>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3">
                {activeTab.chartIds.map(chartId => {
                  const chart = charts.find(c => c.id === chartId);
                  if (!chart) return null;
                  const data = chartDataMap[chart.id!] || [];
                  const isLoading = loadingData.has(chart.id!);

                  // 获取图表的动态过滤器和下钻配置
                  const hasDynamicControls = (chart.dynamicFilters && chart.dynamicFilters.length > 0) ||
                    chart.drilldownConfig?.enabled;
                  const currentDynamicFilterValues = chartDynamicFilterValues[chart.id!] || {};
                  const currentDrilldownSelections = chartDrilldownSelections[chart.id!] ||
                    (chart.drilldownConfig?.defaultSelected ?? []);

                  // 合并基础维度和下钻维度用于渲染
                  const effectiveDimensions = [...chart.dimensions];
                  if (chart.drilldownConfig?.enabled && currentDrilldownSelections.length > 0) {
                    for (const dim of chart.drilldownConfig.dimensions) {
                      if (currentDrilldownSelections.includes(dim.field) &&
                        !effectiveDimensions.some(d => d.field === dim.field)) {
                        effectiveDimensions.push(dim);
                      }
                    }
                  }

                  return (
                    <div key={chartId} className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
                      {/* 图表标题栏 */}
                      <div className="flex items-center justify-between px-3 py-1.5 border-b border-gray-100 bg-gray-50/50">
                        <span className="text-xs font-medium text-gray-700 truncate">{chart.name}</span>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => window.open(`/query?chartId=${chart.id}`, '_blank')}
                            className="chart-card-action p-1 hover:bg-gray-100 rounded text-gray-400 hover:text-blue-500 transition-colors"
                            title="编辑图表"
                          >
                            <PencilIcon className="size-3" />
                          </button>
                          {isEdit && (
                            <button
                              onClick={() => onMoveChartOutOfTab(chartId, activeTab.id)}
                              className="chart-card-action p-1 hover:bg-red-50 rounded text-gray-400 hover:text-red-500 transition-colors"
                              title="移出标签组"
                            >
                              <Trash2Icon className="size-3" />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* 动态过滤器与下钻控件 */}
                      {!isEdit && hasDynamicControls && (
                        <ChartDynamicControls
                          dynamicFilters={chart.dynamicFilters || []}
                          dynamicFilterValues={currentDynamicFilterValues}
                          onDynamicFilterChange={(field, values) => {
                            onDynamicFilterChange(chart.id!, field, values);
                          }}
                          onRemoveDynamicFilter={(field) => {
                            // 从图表配置中移除动态过滤器
                            const newFilterValues = { ...currentDynamicFilterValues };
                            delete newFilterValues[field];
                            
                            // 更新图表配置
                            onChartConfigChange(chart.id!, {
                              dynamicFilters: chart.dynamicFilters?.filter(f => f.field !== field) || []
                            });
                            
                            // 清空该过滤器的值并重新加载数据
                            onDynamicFilterChange(chart.id!, field, []);
                          }}
                          drilldownConfig={chart.drilldownConfig}
                          selectedDrilldownDimensions={currentDrilldownSelections}
                          onDrilldownChange={(dims) => {
                            onDrilldownChange(chart.id!, dims);
                          }}
                          availableFields={allAvailableFields}
                          availableDimensions={allAvailableFields.filter(f =>
                            chart.drilldownConfig?.dimensions.some(d => d.field === f.name)
                          )}
                          isEditMode={false}
                        />
                      )}

                      {/* 图表内容 */}
                      <div className="p-2 min-h-[120px]">
                        {isEdit ? (
                          <div className="flex items-center justify-center h-full min-h-[100px] text-gray-300">
                            <div className="flex flex-col items-center">
                              <ChartTypeIcon type={chart.chartType} />
                              <span className="text-xs mt-1">{chart.chartType}</span>
                              {hasDynamicControls && (
                                <span className="text-xs text-purple-400 mt-1">
                                  {(chart.dynamicFilters?.length || 0) > 0 && `${chart.dynamicFilters!.length} 动态过滤`}
                                  {chart.drilldownConfig?.enabled && ` · 支持下钻`}
                                </span>
                              )}
                            </div>
                          </div>
                        ) : isLoading ? (
                          <div className="flex items-center justify-center h-full min-h-[100px]">
                            <div className="size-5 animate-spin rounded-full border-2 border-gray-200 border-t-blue-400" />
                          </div>
                        ) : (
                          <ChartRenderer
                            chartType={chart.chartType}
                            data={data}
                            dimensions={effectiveDimensions}
                            metrics={chart.metrics}
                          />
                        )}
                      </div>
                    </div>
                  );
                })}
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

function TabLabel({ tab, isActive, isEdit, canRemove, onSwitch, onRemove, onRename }: {
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
        onBlur={() => { onRename(draft); setEditing(false); }}
        onKeyDown={e => { if (e.key === 'Enter') { onRename(draft); setEditing(false); } if (e.key === 'Escape') { setDraft(tab.label); setEditing(false); } }}
        className="chart-card-action px-1 py-0.5 text-xs border border-purple-300 rounded outline-none w-20"
      />
    );
  }

  return (
    <button
      onClick={onSwitch}
      onDoubleClick={() => { if (isEdit) { setDraft(tab.label); setEditing(true); } }}
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
            onClick={e => { e.stopPropagation(); setDraft(tab.label); setEditing(true); }}
            className="chart-card-action p-0.5 text-gray-300 hover:text-blue-400 cursor-pointer rounded hover:bg-blue-50"
            title="重命名"
          >
            <PencilIcon className="size-2.5" />
          </span>
          {canRemove && (
            <span
              onClick={e => { e.stopPropagation(); onRemove(); }}
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

function buildCubeQueryFromChart(
  chart: ChartConfig, 
  dashboardFilters: FilterConfig[],
  dynamicFilterValues?: Record<string, string[]>,
  drilldownSelections?: string[]
) {
  const effectiveFilters = mergeFilters(chart.filters, dashboardFilters);
  
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
  
  // 下钻维度
  if (chart.drilldownConfig?.enabled && drilldownSelections && drilldownSelections.length > 0) {
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
