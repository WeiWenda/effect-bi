import { useState, useCallback, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { BarChart3Icon, LayersIcon, SettingsIcon, XIcon, ChevronDownIcon, PlusIcon } from 'lucide-react';
import { ViewSelectorPanel } from './ViewSelectorPanel';
import { ChartTypeSelector } from './ChartTypeSelector';
import { DimensionDropZone } from './DimensionDropZone';
import { MetricDropZone } from './MetricDropZone';
import { FilterConfigPanel } from './FilterConfigPanel';
import { ChartRenderer } from './ChartRenderer';
import { ChartDynamicControls } from './ChartDynamicControls';
import { DrilldownConfigSection } from './DrilldownConfigSection';
import { DynamicFilterConfigSection } from './DynamicFilterConfigSection';
import { PinToDashboardDialog } from './PinToDashboardDialog';
import { cubeProxyAPI } from '../../services/cubeProxyApi';
import { chartAPI } from '../../services/chartApi';
import type { ChartType, DimensionConfig, MetricConfig, FilterConfig, SortConfig, CubeMeta, CubeQuery, DynamicFilterConfig, DynamicDrilldownConfig } from '../../types/chart';

function buildCubeQuery(
  _chartType: ChartType,
  dimensions: DimensionConfig[],
  metrics: MetricConfig[],
  filters: FilterConfig[],
  sort: SortConfig[],
  limit: number,
  dynamicFilterValues?: Record<string, string[]>,
  drilldownConfig?: DynamicDrilldownConfig,
  selectedDrilldownDimensions?: string[],
): CubeQuery {
  const query: CubeQuery = {
    measures: [],
    dimensions: [],
    timeDimensions: [],
    filters: [],
    order: [],
    limit,
  };

  // 合并基础维度和下钻维度
  let finalDimensions = [...dimensions];
  if (drilldownConfig?.enabled && selectedDrilldownDimensions && selectedDrilldownDimensions.length > 0) {
    const drilldownDims = drilldownConfig.dimensions.filter(d => 
      selectedDrilldownDimensions.includes(d.field)
    );
    finalDimensions = [...finalDimensions, ...drilldownDims];
  }

  for (const dim of finalDimensions) {
    if (dim.timeGranularity) {
      query.timeDimensions.push({
        dimension: dim.field,
        granularity: dim.timeGranularity,
      });
    } else {
      query.dimensions.push(dim.field);
    }
  }

  for (const metric of metrics) {
    query.measures.push(metric.field);
  }

  // 静态过滤器
  for (const filter of filters) {
    query.filters.push({
      member: filter.field,
      operator: filter.operator,
      values: filter.values,
    });
  }

  // 动态过滤器值（运行时用户调整的值）
  if (dynamicFilterValues) {
    for (const [field, values] of Object.entries(dynamicFilterValues)) {
      if (values.length > 0) {
        query.filters.push({
          member: field,
          operator: 'in',
          values,
        });
      }
    }
  }

  for (const s of sort) {
    query.order.push([s.field, s.direction]);
  }

  return query;
}

const QUERY_STORAGE_KEY = 'visualQueryDraft';

interface QueryDraft {
  selectedView: string | null;
  chartType: ChartType;
  dimensions: DimensionConfig[];
  metrics: MetricConfig[];
  filters: FilterConfig[];
  dynamicFilters?: DynamicFilterConfig[];
  drilldownConfig?: DynamicDrilldownConfig;
  sort: SortConfig[];
  chartName: string;
}

function loadDraft(): QueryDraft | null {
  try {
    const raw = localStorage.getItem(QUERY_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
}

function saveDraft(draft: QueryDraft) {
  try {
    localStorage.setItem(QUERY_STORAGE_KEY, JSON.stringify(draft));
  } catch { /* ignore */ }
}

function clearDraft() {
  try {
    localStorage.removeItem(QUERY_STORAGE_KEY);
  } catch { /* ignore */ }
}

export function VisualQueryPage(): React.JSX.Element {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const editingChartId = searchParams.get('chartId') ? parseInt(searchParams.get('chartId')!) : null;
  const cubeNameParam = searchParams.get('cubeName');

  const draft = loadDraft();
  const [selectedView, setSelectedView] = useState<string | null>(draft?.selectedView ?? null);
  const [selectedCube, setSelectedCube] = useState<CubeMeta | null>(null);
  const [chartType, setChartType] = useState<ChartType>(draft?.chartType ?? 'table');
  const [dimensions, setDimensions] = useState<DimensionConfig[]>(draft?.dimensions ?? []);
  const [metrics, setMetrics] = useState<MetricConfig[]>(draft?.metrics ?? []);
  const [filters, setFilters] = useState<FilterConfig[]>(draft?.filters ?? []);
  const [dynamicFilters, setDynamicFilters] = useState<DynamicFilterConfig[]>(draft?.dynamicFilters ?? []);
  const [dynamicFilterValues, setDynamicFilterValues] = useState<Record<string, string[]>>({});
  const [drilldownConfig, setDrilldownConfig] = useState<DynamicDrilldownConfig | undefined>(draft?.drilldownConfig);
  const [selectedDrilldownDimensions, setSelectedDrilldownDimensions] = useState<string[]>(
    draft?.drilldownConfig?.defaultSelected ?? []
  );
  const [sort, setSort] = useState<SortConfig[]>(draft?.sort ?? []);
  const [limit] = useState(500);

  const [queryData, setQueryData] = useState<any[]>([]);
  const [queryLoading, setQueryLoading] = useState(false);
  const [queryError, setQueryError] = useState<string | null>(null);

  const [pinDialogOpen, setPinDialogOpen] = useState(false);
  const [chartName, setChartName] = useState(draft?.chartName ?? '未命名图表');

  // Persist query draft to localStorage whenever config changes
  useEffect(() => {
    saveDraft({ 
      selectedView, 
      chartType, 
      dimensions, 
      metrics, 
      filters, 
      dynamicFilters,
      drilldownConfig,
      sort, 
      chartName 
    });
  }, [selectedView, chartType, dimensions, metrics, filters, dynamicFilters, drilldownConfig, sort, chartName]);

  // Restore selectedCube from draft after cubes metadata loads
  useEffect(() => {
    if (selectedView && !selectedCube) {
      cubeProxyAPI.meta().then(res => {
        const cube = (res.cubes || []).find(c => c.name === selectedView);
        if (cube) setSelectedCube(cube);
      }).catch(() => {});
    }
  }, []);

  // Load existing chart if editing
  useEffect(() => {
    if (!editingChartId) return;
    chartAPI.get(editingChartId).then(chart => {
      setSelectedView(chart.viewName);
      setChartType(chart.chartType);
      setDimensions(chart.dimensions);
      setMetrics(chart.metrics);
      setFilters(chart.filters);
      setDynamicFilters(chart.dynamicFilters ?? []);
      setDrilldownConfig(chart.drilldownConfig);
      setSelectedDrilldownDimensions(chart.drilldownConfig?.defaultSelected ?? []);
      setSort(chart.sort);
      setChartName(chart.name);
      // Also load cube metadata so the ViewSelectorPanel can expand the right view
      cubeProxyAPI.meta().then(res => {
        const cube = (res.cubes || []).find(c => c.name === chart.viewName);
        if (cube) setSelectedCube(cube);
      }).catch(() => {});
    }).catch(err => {
      console.error('Error loading chart for editing:', err);
    });
  }, [editingChartId]);

  // Auto-select view when cubeName is provided in URL
  useEffect(() => {
    if (!cubeNameParam) return;
    cubeProxyAPI.meta().then(res => {
      const cubeNameLower = cubeNameParam.toLowerCase().replace(/[^a-z0-9_]/g, '_');
      const cube = (res.cubes || []).find(c => c.name === cubeNameLower);
      if (cube) {
        setSelectedView(cube.name);
        setSelectedCube(cube);
      }
    }).catch(() => {});
  }, [cubeNameParam]);

  const handleViewSelect = useCallback((viewName: string, cube: CubeMeta) => {
    setSelectedView(viewName);
    setSelectedCube(cube);
    // Reset config when switching view
    setDimensions([]);
    setMetrics([]);
    setFilters([]);
    setDynamicFilters([]);
    setDynamicFilterValues({});
    setDrilldownConfig(undefined);
    setSelectedDrilldownDimensions([]);
    setSort([]);
    setQueryData([]);
  }, []);

  const handleRunQuery = useCallback(async () => {
    if (metrics.length === 0 && dimensions.length === 0) return;
    setQueryLoading(true);
    setQueryError(null);
    try {
      const cubeQuery = buildCubeQuery(
        chartType, 
        dimensions, 
        metrics, 
        filters, 
        sort, 
        limit,
        dynamicFilterValues,
        drilldownConfig,
        selectedDrilldownDimensions
      );
      const result = await cubeProxyAPI.load(cubeQuery);
      setQueryData(result.data || []);
    } catch (err: any) {
      setQueryError(err?.response?.data?.error || err?.message || '查询失败');
    } finally {
      setQueryLoading(false);
    }
  }, [chartType, dimensions, metrics, filters, sort, limit, dynamicFilterValues, drilldownConfig, selectedDrilldownDimensions]);

  const handlePinToDashboard = useCallback(async (dashboardId: number, modifiedChartName: string) => {
    try {
      const finalChartName = modifiedChartName || chartName;
      if (finalChartName !== chartName) {
        setChartName(finalChartName);
      }
      let chartId: number;
      const chartData = {
        name: finalChartName,
        viewName: selectedView || '',
        chartType,
        dimensions,
        metrics,
        filters,
        dynamicFilters,
        drilldownConfig,
        sort,
        limit,
      };
      
      if (editingChartId) {
        await chartAPI.update(editingChartId, chartData);
        chartId = editingChartId;
      } else {
        const chart = await chartAPI.create(chartData);
        chartId = chart.id!;
      }

      // Add to dashboard
      const { dashboardAPI } = await import('../../services/dashboardApi');
      await dashboardAPI.addChart(dashboardId, chartId);

      setPinDialogOpen(false);
      clearDraft();
      navigate(`/dashboard/${dashboardId}`);
    } catch (err) {
      console.error('Error pinning chart to dashboard:', err);
    }
  }, [editingChartId, chartName, selectedCube, selectedView, chartType, dimensions, metrics, filters, sort, limit, navigate, setChartName]);

  // Build available fields for filter config
  const availableFields = [
    ...(selectedCube?.dimensions.map(d => ({ name: d.name, title: d.title, shortTitle: d.shortTitle, type: d.type })) || []),
    ...(selectedCube?.measures.map(m => ({ name: m.name, title: m.title, shortTitle: m.shortTitle, type: m.type })) || []),
  ];

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-200 bg-white shrink-0">
        <div className="flex items-center gap-2">
          <BarChart3Icon className="size-5 text-blue-600" />
          <h1 className="text-lg font-semibold text-gray-800">可视化查询</h1>
          {selectedView && (
            <span className="text-sm text-gray-500">— {selectedView}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={chartName}
            onChange={e => setChartName(e.target.value)}
            className="text-sm border border-gray-200 rounded px-2 py-1 w-40 focus:outline-none focus:ring-1 focus:ring-blue-400"
            placeholder="图表名称"
          />
          <button
            onClick={handleRunQuery}
            disabled={queryLoading || (metrics.length === 0 && dimensions.length === 0)}
            className="px-4 py-1.5 bg-blue-500 text-white rounded-md text-sm font-medium hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {queryLoading ? '查询中...' : '运行查询'}
          </button>
          <button
            onClick={() => setPinDialogOpen(true)}
            disabled={metrics.length === 0 && dimensions.length === 0}
            className="px-4 py-1.5 bg-green-500 text-white rounded-md text-sm font-medium hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            📌 Pin 到看板
          </button>
        </div>
      </div>

      {/* Main Content: Left | Center | Right */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel - View Selector */}
        <div className="w-64 border-r border-gray-200 shrink-0">
          <ViewSelectorPanel selectedView={selectedView} onViewSelect={handleViewSelect} />
        </div>

        {/* Center Panel - Chart Config */}
        <div className="w-80 border-r border-gray-200 bg-white overflow-auto p-4 space-y-4 shrink-0">
          <div>
            <div className="text-xs font-medium text-gray-400 mb-2">可视化类型</div>
            <ChartTypeSelector value={chartType} onChange={setChartType} />
          </div>

          <DimensionDropZone dimensions={dimensions} onChange={setDimensions} />

          <MetricDropZone metrics={metrics} onChange={setMetrics} />

          <FilterConfigPanel 
            filters={filters} 
            onChange={setFilters} 
            availableFields={availableFields}
          />

          {/* 动态过滤器配置 */}
          <DynamicFilterConfigSection
            dynamicFilters={dynamicFilters}
            onDynamicFiltersChange={setDynamicFilters}
            availableFields={availableFields}
          />

          {/* 动态维度下钻配置 */}
          <DrilldownConfigSection
            drilldownConfig={drilldownConfig}
            onDrilldownConfigChange={setDrilldownConfig}
            onDrilldownChange={setSelectedDrilldownDimensions}
            selectedDrilldownDimensions={selectedDrilldownDimensions}
            availableDimensions={selectedCube?.dimensions ?? []}
          />
        </div>

        {/* Right Panel - Chart Preview */}
        <div className="flex-1 flex flex-col overflow-hidden bg-white">
          {/* 运行时动态过滤器与维度下钻控件区 */}
          <ChartDynamicControls
            dynamicFilters={dynamicFilters}
            dynamicFilterValues={dynamicFilterValues}
            onDynamicFilterChange={(field, values) => {
              setDynamicFilterValues(prev => ({ ...prev, [field]: values }));
            }}
            drilldownConfig={drilldownConfig}
            selectedDrilldownDimensions={selectedDrilldownDimensions}
            onDrilldownChange={setSelectedDrilldownDimensions}
            availableFields={selectedCube?.dimensions ?? []}
            availableDimensions={selectedCube?.dimensions ?? []}
            isEditMode={false}
          />
          
          <div className="flex-1 p-4 overflow-auto">
            {queryError ? (
              <div className="text-sm text-red-500 text-center py-8">{queryError}</div>
            ) : queryData.length > 0 ? (
              <ChartRenderer
                chartType={chartType}
                data={queryData}
                dimensions={dimensions}
                metrics={metrics}
              />
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-gray-300">
                <BarChart3Icon className="size-12 mb-3" />
                <p className="text-sm">配置维度和指标后运行查询</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Pin to Dashboard Dialog */}
      {pinDialogOpen && (
        <PinToDashboardDialog
          open={pinDialogOpen}
          onClose={() => setPinDialogOpen(false)}
          onPin={handlePinToDashboard}
          chartName={chartName}
        />
      )}
    </div>
  );
}
