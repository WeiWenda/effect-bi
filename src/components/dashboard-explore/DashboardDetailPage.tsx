import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeftIcon, EditIcon, EyeIcon, Trash2Icon, FilterIcon, SaveIcon, PencilIcon } from 'lucide-react';
import ReactGridLayout from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import { dashboardAPI } from '../../services/dashboardApi';
import { cubeProxyAPI } from '../../services/cubeProxyApi';
import { ChartRenderer } from '../query-explore/ChartRenderer';
import { FilterConfigPanel } from '../query-explore/FilterConfigPanel';
import { useToast } from '../ui/toast';
import type { DashboardInfo, ChartConfig, FilterConfig, DashboardLayoutItem } from '../../types/chart';

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
      setLayout(detail.dashboard.layout || []);

      // Auto-generate layout if empty
      if ((!detail.dashboard.layout || detail.dashboard.layout.length === 0) && detail.charts.length > 0) {
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
          const cubeQuery = buildCubeQueryFromChart(chart, dashboardFilters);
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
  }, [mode, charts, dashboardFilters]);

  const handleLayoutChange = useCallback((newLayout: any) => {
    const items = Array.isArray(newLayout) ? newLayout : [newLayout];
    const newItems: DashboardLayoutItem[] = items.map((item: any) => ({
      i: item.i,
      x: item.x,
      y: item.y,
      w: item.w,
      h: item.h,
      minW: item.minW,
      minH: item.minH,
    }));
    setLayout(newItems);
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
            <button
              onClick={handleSaveLayout}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-500 text-white rounded-md text-sm font-medium hover:bg-blue-600 transition-colors"
            >
              <SaveIcon className="size-4" />
              保存布局
            </button>
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

      {/* Dashboard-level Filter Bar */}
      <div className="px-4 py-2 border-b border-gray-200 bg-white shrink-0">
        <div className="flex items-start gap-3">
          <div className="flex items-center gap-1.5 text-sm text-gray-500 shrink-0 pt-1">
            <FilterIcon className="size-4" />
            <span>看板筛选器</span>
          </div>
          <div className="flex-1">
            <FilterConfigPanel
              filters={dashboardFilters}
              onChange={handleDashboardFilterChange}
              availableFields={allAvailableFields}
            />
          </div>
        </div>
      </div>

      {/* Grid Content */}
      <div className="flex-1 overflow-auto p-4">
        {charts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-400">
            <LayoutDashboardIcon className="size-12 mb-3" />
            <p className="text-sm">暂无图表</p>
            <p className="text-xs text-gray-400 mt-2">从查询页 Pin 图表到看板</p>
          </div>
        ) : (
          <ReactGridLayout
            layout={layout.map(item => ({ ...item }))}
            width={1200}
            gridConfig={{ cols: COLS, rowHeight: ROW_HEIGHT, margin: [10, 10], containerPadding: null, maxRows: Infinity }}
            dragConfig={{ enabled: mode === 'edit', cancel: '.chart-card-action', bounded: false, threshold: 3 }}
            resizeConfig={{ enabled: mode === 'edit', handles: ['se'] }}
            onLayoutChange={handleLayoutChange}
          >
            {charts.map(chart => {
              const chartLayout = layout.find(l => l.i === String(chart.id));
              if (!chartLayout) return null;

              const data = chartDataMap[chart.id!] || [];
              const isLoading = loadingData.has(chart.id!);

              return (
                <div key={String(chart.id)} className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden flex flex-col">
                  {/* Chart Header */}
                  <div className="flex items-center justify-between px-3 py-1.5 border-b border-gray-100 bg-gray-50/50 shrink-0">
                    <span className="text-xs font-medium text-gray-600 truncate">{chart.name}</span>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleEditChart(chart.id!)}
                        className="chart-card-action p-1 hover:bg-gray-100 rounded text-gray-400 hover:text-blue-500 transition-colors"
                        title="编辑图表"
                      >
                        <PencilIcon className="size-3" />
                      </button>
                      {mode === 'edit' && (
                        <button
                          onClick={() => handleRemoveChart(chart.id!)}
                          className="chart-card-action p-1 hover:bg-red-50 rounded text-gray-400 hover:text-red-500 transition-colors"
                          title="移除图表"
                        >
                          <Trash2Icon className="size-3" />
                        </button>
                      )}
                    </div>
                  </div>
                  {/* Chart Body */}
                  <div className="flex-1 p-2 min-h-0">
                    {mode === 'edit' ? (
                      <div className="flex flex-col items-center justify-center h-full text-gray-300">
                        <ChartTypeIcon type={chart.chartType} />
                        <span className="text-xs mt-1">{chart.chartType}</span>
                        <span className="text-xs text-gray-400 mt-0.5">
                          {chart.dimensions.length} 维度 / {chart.metrics.length} 指标
                        </span>
                      </div>
                    ) : isLoading ? (
                      <div className="flex items-center justify-center h-full">
                        <div className="size-5 animate-spin rounded-full border-2 border-gray-200 border-t-blue-400" />
                      </div>
                    ) : (
                      <ChartRenderer
                        chartType={chart.chartType}
                        data={data}
                        dimensions={chart.dimensions}
                        metrics={chart.metrics}
                      />
                    )}
                  </div>
                </div>
              );
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

function buildCubeQueryFromChart(chart: ChartConfig, dashboardFilters: FilterConfig[]) {
  const effectiveFilters = mergeFilters(chart.filters, dashboardFilters);
  const query = {
    measures: chart.metrics.map(m => m.field),
    dimensions: [] as string[],
    timeDimensions: [] as any[],
    filters: effectiveFilters.map(f => ({ member: f.field, operator: f.operator, values: f.values })),
    order: chart.sort.map(s => [s.field, s.direction] as [string, 'asc' | 'desc']),
    limit: chart.limit || 500,
  };

  for (const dim of chart.dimensions) {
    if (dim.timeGranularity) {
      query.timeDimensions.push({ dimension: dim.field, granularity: dim.timeGranularity });
    } else {
      query.dimensions.push(dim.field);
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
