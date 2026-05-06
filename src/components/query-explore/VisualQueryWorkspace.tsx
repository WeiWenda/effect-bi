import { useState, useCallback, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { BarChart3Icon } from 'lucide-react';
import { ViewSelectorPanel } from './ViewSelectorPanel';
import { ChartTypeSelector } from './ChartTypeSelector';
import { DimensionDropZone } from './DimensionDropZone';
import { MetricDropZone } from './MetricDropZone';
import { StaticFilterConfigZone } from './StaticFilterConfigZone';
import { ChartRenderer } from './ChartRenderer';
import { ChartDynamicControls } from './ChartDynamicControls';
import { DynamicDrilldownConfigZone } from './DynamicDrilldownConfigZone';
import { DynamicFilterConfigZone } from './DynamicFilterConfigZone';
import { PinToDashboardDialog } from './PinToDashboardDialog';
import { cubeProxyAPI } from '../../services/cubeProxyApi';
import { chartAPI } from '../../services/chartApi';
import { dashboardAPI } from '../../services/dashboardApi';
import { useToast } from '../ui/toast';
import { normalizeDrilldownConfigForClient } from '../../utils/drilldownConfig';
import {
  type ChartType,
  type ChartConfig,
  type DimensionConfig,
  type MetricConfig,
  type FilterConfig,
  type SortConfig,
  type CubeMeta,
  type CubeQuery,
  type DynamicFilterConfig,
  type DynamicDrilldownConfig,
  type RtfTextChartConfig,
  normalizeChartTypeForVisualQuery,
  isVisualQueryChartTypeDisabled,
  chartTypeUsesNoDimensions,
  chartTypeMaxMetrics,
} from '../../types/chart';
import { RtfTextChartConfigSection } from './RtfTextChartConfigSection';
import {
  migrateLayoutToTabOnly,
  mergeLayoutWithMainStackOrder,
  mainStackIdsInOrder,
  assignChartToTabInGroup,
} from '../../utils/dashboardTabOnlyLayout';
import { expandFiltersForQuery } from '../../utils/filterTimeRelative';
import { normalizeRtfTextChartConfig } from '../../utils/rtfTextInterpolation';

function buildCubeQuery(
  _chartType: ChartType,
  dimensions: DimensionConfig[],
  metrics: MetricConfig[],
  filters: FilterConfig[],
  sort: SortConfig[],
  limit: number,
  dynamicFilterValues?: Record<string, string[]>,
  drilldownConfig?: DynamicDrilldownConfig,
  selectedDrilldownDimensions?: string[]
): CubeQuery {
  const query: CubeQuery = {
    measures: [],
    dimensions: [],
    timeDimensions: [],
    filters: [],
    order: [],
    limit,
  };

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

  for (const filter of expandFiltersForQuery(filters)) {
    query.filters.push({
      member: filter.field,
      operator: filter.operator,
      values: filter.values,
    });
  }

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
  rtfTextConfig?: RtfTextChartConfig;
  sort: SortConfig[];
  chartName: string;
}

function loadDraft(): QueryDraft | null {
  try {
    const raw = localStorage.getItem(QUERY_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function saveDraft(draft: QueryDraft) {
  try {
    localStorage.setItem(QUERY_STORAGE_KEY, JSON.stringify(draft));
  } catch {
    /* ignore */
  }
}

function clearDraft() {
  try {
    localStorage.removeItem(QUERY_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export interface VisualQueryEmbedConfig {
  dashboardId: number;
  sourceTabGroupId: string;
  sourceTabId: string;
  onCancel: () => void;
  onAdded: () => void | Promise<void>;
}

export function VisualQueryWorkspace({
  variant,
  embed,
}: {
  variant: 'page' | 'embed';
  embed?: VisualQueryEmbedConfig;
}): React.JSX.Element {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const editingChartId =
    variant === 'page' && searchParams.get('chartId')
      ? parseInt(searchParams.get('chartId')!, 10)
      : null;
  const sourceDashboardId =
    variant === 'page' && searchParams.get('dashboardId')
      ? parseInt(searchParams.get('dashboardId')!, 10)
      : null;
  const canUpdateSourceDashboardChart =
    Boolean(editingChartId) && sourceDashboardId != null && !Number.isNaN(sourceDashboardId);
  const cubeNameParam = variant === 'page' ? searchParams.get('cubeName') : null;

  const draft = variant === 'page' ? loadDraft() : null;
  const [selectedView, setSelectedView] = useState<string | null>(draft?.selectedView ?? null);
  const [selectedCube, setSelectedCube] = useState<CubeMeta | null>(null);
  const [chartType, setChartType] = useState<ChartType>(() =>
    normalizeChartTypeForVisualQuery(draft?.chartType ?? 'table')
  );
  const [dimensions, setDimensions] = useState<DimensionConfig[]>(() => {
    const t = normalizeChartTypeForVisualQuery(draft?.chartType ?? 'table');
    return chartTypeUsesNoDimensions(t) ? [] : (draft?.dimensions ?? []);
  });
  const [metrics, setMetrics] = useState<MetricConfig[]>(draft?.metrics ?? []);
  const [filters, setFilters] = useState<FilterConfig[]>(draft?.filters ?? []);
  const [dynamicFilters, setDynamicFilters] = useState<DynamicFilterConfig[]>(draft?.dynamicFilters ?? []);
  const [dynamicFilterValues, setDynamicFilterValues] = useState<Record<string, string[]>>({});
  const [drilldownConfig, setDrilldownConfig] = useState<DynamicDrilldownConfig | undefined>(() => {
    const t = normalizeChartTypeForVisualQuery(draft?.chartType ?? 'table');
    return chartTypeUsesNoDimensions(t)
      ? undefined
      : normalizeDrilldownConfigForClient(draft?.drilldownConfig);
  });
  const [selectedDrilldownDimensions, setSelectedDrilldownDimensions] = useState<string[]>(() => {
    const t = normalizeChartTypeForVisualQuery(draft?.chartType ?? 'table');
    return chartTypeUsesNoDimensions(t) ? [] : (draft?.drilldownConfig?.defaultSelected ?? []);
  });
  const [sort, setSort] = useState<SortConfig[]>(draft?.sort ?? []);
  const [rtfTextConfig, setRtfTextConfig] = useState<RtfTextChartConfig>(() =>
    normalizeRtfTextChartConfig(draft?.rtfTextConfig ?? null)
  );
  const [limit] = useState(500);

  const [queryData, setQueryData] = useState<any[]>([]);
  const [queryLoading, setQueryLoading] = useState(false);
  const [queryError, setQueryError] = useState<string | null>(null);

  /** null 关闭；pin = 复制新图表并加入所选看板；update = 写回当前 chartId 与来源看板 */
  const [pinDialogMode, setPinDialogMode] = useState<'pin' | 'update' | null>(null);
  const [chartName, setChartName] = useState(draft?.chartName ?? '未命名图表');
  const [confirmAddLoading, setConfirmAddLoading] = useState(false);

  useEffect(() => {
    if (variant !== 'page') return;
    saveDraft({
      selectedView,
      chartType,
      dimensions,
      metrics,
      filters,
      dynamicFilters,
      drilldownConfig,
      rtfTextConfig,
      sort,
      chartName,
    });
  }, [
    variant,
    selectedView,
    chartType,
    dimensions,
    metrics,
    filters,
    dynamicFilters,
    drilldownConfig,
    rtfTextConfig,
    sort,
    chartName,
  ]);

  useEffect(() => {
    if (selectedView && !selectedCube) {
      cubeProxyAPI
        .meta()
        .then(res => {
          const cube = (res.cubes || []).find(c => c.name === selectedView);
          if (cube) setSelectedCube(cube);
        })
        .catch(() => {});
    }
  }, [selectedView, selectedCube]);

  useEffect(() => {
    if (!editingChartId) return;
    chartAPI
      .get(editingChartId)
      .then(chart => {
        setSelectedView(chart.viewName);
        const nextType = normalizeChartTypeForVisualQuery(chart.chartType);
        setChartType(nextType);
        if (isVisualQueryChartTypeDisabled(chart.chartType)) {
          toast('漏斗图、地图在可视化查询中暂不支持，已切换为表格', 'info');
        }
        setDimensions(chartTypeUsesNoDimensions(nextType) ? [] : chart.dimensions);
        setMetrics(chart.metrics);
        setFilters(chart.filters);
        setDynamicFilters(chart.dynamicFilters ?? []);
        if (chartTypeUsesNoDimensions(nextType)) {
          setDrilldownConfig(undefined);
          setSelectedDrilldownDimensions([]);
        } else {
          setDrilldownConfig(chart.drilldownConfig);
          setSelectedDrilldownDimensions(chart.drilldownConfig?.defaultSelected ?? []);
        }
        setSort(chart.sort);
        setChartName(chart.name);
        setRtfTextConfig(normalizeRtfTextChartConfig(chart.rtfTextConfig ?? null));
        cubeProxyAPI
          .meta()
          .then(res => {
            const cube = (res.cubes || []).find(c => c.name === chart.viewName);
            if (cube) setSelectedCube(cube);
          })
          .catch(() => {});
      })
      .catch(err => {
        console.error('Error loading chart for editing:', err);
      });
  }, [editingChartId]);

  useEffect(() => {
    if (!cubeNameParam) return;
    cubeProxyAPI
      .meta()
      .then(res => {
        const cubeNameLower = cubeNameParam.toLowerCase().replace(/[^a-z0-9_]/g, '_');
        const cube = (res.cubes || []).find(c => c.name === cubeNameLower);
        if (cube) {
          setSelectedView(cube.name);
          setSelectedCube(cube);
        }
      })
      .catch(() => {});
  }, [cubeNameParam]);

  const handleChartTypeChange = useCallback((t: ChartType) => {
    const next = normalizeChartTypeForVisualQuery(t);
    setChartType(next);
    if (chartTypeUsesNoDimensions(next)) {
      setDimensions([]);
      setDrilldownConfig(undefined);
      setSelectedDrilldownDimensions([]);
    }
    // 指标数超出限制时截断
    const maxM = chartTypeMaxMetrics(next);
    if (maxM != null) {
      setMetrics(prev => prev.length > maxM ? prev.slice(0, maxM) : prev);
    }
  }, []);

  const handleViewSelect = useCallback((viewName: string, cube: CubeMeta) => {
    setSelectedView(viewName);
    setSelectedCube(cube);
    setDimensions([]);
    setMetrics([]);
    setFilters([]);
    setDynamicFilters([]);
    setDynamicFilterValues({});
    setDrilldownConfig(undefined);
    setSelectedDrilldownDimensions([]);
    setSort([]);
    setQueryData([]);
    setRtfTextConfig(normalizeRtfTextChartConfig(null));
  }, []);

  const canRunQuery =
    chartType === 'rtf-text'
      ? rtfTextConfig.interpolationExpression.trim().length > 0
      : chartType === 'number'
        ? metrics.length > 0
        : metrics.length > 0 || dimensions.length > 0;

  const handleRunQuery = useCallback(async () => {
    if (!canRunQuery) return;
    setQueryLoading(true);
    setQueryError(null);
    try {
      if (chartType === 'rtf-text' && metrics.length === 0) {
        setQueryData([{}]);
      } else {
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
      }
    } catch (err: any) {
      setQueryError(err?.response?.data?.error || err?.message || '查询失败');
    } finally {
      setQueryLoading(false);
    }
  }, [
    canRunQuery,
    chartType,
    dimensions,
    metrics,
    filters,
    sort,
    limit,
    dynamicFilterValues,
    drilldownConfig,
    selectedDrilldownDimensions,
  ]);

  const buildChartPayload = useCallback(
    (finalChartName: string): Omit<ChartConfig, 'id' | 'createdAt' | 'updatedAt'> => ({
      name: finalChartName,
      viewName: selectedView || '',
      chartType,
      dimensions: chartTypeUsesNoDimensions(chartType) ? [] : dimensions,
      metrics,
      filters,
      dynamicFilters,
      drilldownConfig: chartTypeUsesNoDimensions(chartType) ? undefined : drilldownConfig,
      rtfTextConfig: chartType === 'rtf-text' ? rtfTextConfig : undefined,
      sort,
      limit,
    }),
    [
      selectedView,
      chartType,
      dimensions,
      metrics,
      filters,
      dynamicFilters,
      drilldownConfig,
      rtfTextConfig,
      sort,
      limit,
    ]
  );

  const handlePinDialogConfirm = useCallback(
    async (dashboardId: number, modifiedChartName: string) => {
      const mode = pinDialogMode;
      try {
        const defaultName = chartType === 'rtf-text' ? '文本' : '未命名图表';
        const finalChartName = modifiedChartName.trim() || chartName.trim() || defaultName;
        if (finalChartName !== chartName) {
          setChartName(finalChartName);
        }
        const chartData = buildChartPayload(finalChartName);

        if (mode === 'update') {
          if (!editingChartId || sourceDashboardId == null || dashboardId !== sourceDashboardId) {
            return;
          }
          await chartAPI.update(editingChartId, chartData);
          setPinDialogMode(null);
          toast('图表已更新', 'success');
          clearDraft();
          navigate(`/dashboard/${dashboardId}`);
          return;
        }

        // Pin：始终新建图表副本再加入看板（含从看板编辑后复制到其它看板）
        const chart = await chartAPI.create(chartData);
        const newChartId = chart.id!;

        await dashboardAPI.addChart(dashboardId, newChartId);
        const detail = await dashboardAPI.get(dashboardId);
        const allChartIds = detail.charts.map(c => c.id!).filter(Boolean);
        let nextLayout = migrateLayoutToTabOnly(detail.dashboard.layout || [], allChartIds);
        nextLayout = mergeLayoutWithMainStackOrder(nextLayout, mainStackIdsInOrder(nextLayout));
        await dashboardAPI.update(dashboardId, { layout: nextLayout });

        setPinDialogMode(null);
        clearDraft();
        navigate(`/dashboard/${dashboardId}`);
      } catch (err) {
        console.error('Error pinning or updating chart:', err);
        toast(mode === 'update' ? '更新失败' : 'Pin 失败', 'error');
      }
    },
    [
      pinDialogMode,
      editingChartId,
      sourceDashboardId,
      chartName,
      chartType,
      buildChartPayload,
      navigate,
      toast,
    ]
  );

  const handleConfirmAddToTab = useCallback(async () => {
    if (variant !== 'embed' || !embed) return;
    if (!canRunQuery) {
      toast(
        chartType === 'rtf-text'
          ? '请先填写展示文本（插值模板）'
          : chartType === 'number'
            ? '请先配置至少一个指标'
            : '请至少配置维度或指标',
        'error'
      );
      return;
    }
    setConfirmAddLoading(true);
    try {
      const chartData: Omit<ChartConfig, 'id' | 'createdAt' | 'updatedAt'> = {
        name: chartType === 'rtf-text' ? chartName.trim() || '文本' : chartName.trim() || '未命名图表',
        viewName: selectedView || '',
        chartType,
        dimensions: chartTypeUsesNoDimensions(chartType) ? [] : dimensions,
        metrics,
        filters,
        dynamicFilters,
        drilldownConfig: chartTypeUsesNoDimensions(chartType) ? undefined : drilldownConfig,
        rtfTextConfig: chartType === 'rtf-text' ? rtfTextConfig : undefined,
        sort,
        limit,
      };
      const chart = await chartAPI.create(chartData);
      const chartId = chart.id!;

      await dashboardAPI.addChart(embed.dashboardId, chartId);
      const detail = await dashboardAPI.get(embed.dashboardId);
      const allChartIds = detail.charts.map(c => c.id!).filter(Boolean);
      let nextLayout = migrateLayoutToTabOnly(detail.dashboard.layout || [], allChartIds);
      nextLayout = assignChartToTabInGroup(
        nextLayout,
        embed.sourceTabGroupId,
        embed.sourceTabId,
        chartId
      );
      nextLayout = mergeLayoutWithMainStackOrder(nextLayout, mainStackIdsInOrder(nextLayout));
      await dashboardAPI.update(embed.dashboardId, { layout: nextLayout });

      await embed.onAdded();
      toast('图表已添加到当前标签', 'success');
      embed.onCancel();
    } catch (err) {
      console.error('Error adding chart to dashboard tab:', err);
      toast('添加失败', 'error');
    } finally {
      setConfirmAddLoading(false);
    }
  }, [
    variant,
    embed,
    canRunQuery,
    chartName,
    selectedView,
    chartType,
    dimensions,
    metrics,
    filters,
    dynamicFilters,
    drilldownConfig,
    rtfTextConfig,
    sort,
    limit,
    toast,
  ]);

  const availableFields = [
    ...(selectedCube?.dimensions.map(d => ({
      name: d.name,
      title: d.title,
      shortTitle: d.shortTitle,
      type: d.type,
    })) || []),
    ...(selectedCube?.measures.map(m => ({
      name: m.name,
      title: m.title,
      shortTitle: m.shortTitle,
      type: m.type,
    })) || []),
  ];

  const isEmbed = variant === 'embed';

  return (
    <div className="h-full flex flex-col bg-gray-50 min-h-0">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-200 bg-white shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <BarChart3Icon className="size-5 text-blue-600 shrink-0" />
          <h1 className="text-lg font-semibold text-gray-800 truncate">
            {isEmbed ? '添加图表' : '可视化查询'}
          </h1>
          {selectedView && (
            <span className="text-sm text-gray-500 truncate hidden sm:inline">— {selectedView}</span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {chartType !== 'rtf-text' && (
            <input
              type="text"
              value={chartName}
              onChange={e => setChartName(e.target.value)}
              className="text-sm border border-gray-200 rounded px-2 py-1 w-36 sm:w-40 focus:outline-none focus:ring-1 focus:ring-blue-400"
              placeholder="图表名称"
            />
          )}
          <button
            type="button"
            onClick={handleRunQuery}
            disabled={queryLoading || !canRunQuery}
            className="px-3 sm:px-4 py-1.5 bg-blue-500 text-white rounded-md text-sm font-medium hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {queryLoading ? '查询中...' : '运行查询'}
          </button>
          {isEmbed && embed ? (
            <>
              <button
                type="button"
                onClick={() => embed.onCancel()}
                disabled={confirmAddLoading}
                className="px-3 sm:px-4 py-1.5 border border-gray-300 bg-white text-gray-700 rounded-md text-sm font-medium hover:bg-gray-50 disabled:opacity-50 transition-colors"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => void handleConfirmAddToTab()}
                disabled={confirmAddLoading || !canRunQuery}
                className="px-3 sm:px-4 py-1.5 bg-green-600 text-white rounded-md text-sm font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {confirmAddLoading ? '添加中...' : '确认添加'}
              </button>
            </>
          ) : (
            <>
              {canUpdateSourceDashboardChart ? (
                <button
                  type="button"
                  onClick={() => setPinDialogMode('update')}
                  disabled={!canRunQuery}
                  className="px-3 sm:px-4 py-1.5 border border-gray-300 bg-white text-gray-800 rounded-md text-sm font-medium hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0"
                >
                  更新看板图表
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => setPinDialogMode('pin')}
                disabled={!canRunQuery}
                className="px-3 sm:px-4 py-1.5 bg-green-500 text-white rounded-md text-sm font-medium hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0"
              >
                📌 Pin 到看板
              </button>
            </>
          )}
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden min-h-0">
        <div className="w-64 border-r border-gray-200 shrink-0">
          <ViewSelectorPanel selectedView={selectedView} onViewSelect={handleViewSelect} />
        </div>

        <div className="w-80 border-r border-gray-200 bg-white overflow-auto p-4 space-y-4 shrink-0">
          <div>
            <div className="text-xs font-medium text-gray-400 mb-2">可视化类型</div>
            <ChartTypeSelector value={chartType} onChange={handleChartTypeChange} />
          </div>

          {!chartTypeUsesNoDimensions(chartType) ? (
            <DimensionDropZone dimensions={dimensions} onChange={setDimensions} />
          ) : null}

          <MetricDropZone metrics={metrics} onChange={setMetrics} maxMetrics={chartTypeMaxMetrics(chartType)} />

          {chartType === 'rtf-text' && (
            <RtfTextChartConfigSection value={rtfTextConfig} onChange={setRtfTextConfig} />
          )}

          <StaticFilterConfigZone
            filters={filters}
            onChange={setFilters}
            availableFields={availableFields}
            cubeViewName={selectedView}
          />

          <DynamicFilterConfigZone
            dynamicFilters={dynamicFilters}
            onDynamicFiltersChange={setDynamicFilters}
            availableFields={availableFields}
            cubeViewName={selectedView}
          />

          {!chartTypeUsesNoDimensions(chartType) && (
            <DynamicDrilldownConfigZone
              drilldownConfig={drilldownConfig}
              onDrilldownConfigChange={setDrilldownConfig}
              onDrilldownChange={setSelectedDrilldownDimensions}
              selectedDrilldownDimensions={selectedDrilldownDimensions}
              availableDimensions={selectedCube?.dimensions ?? []}
            />
          )}
        </div>

        <div className="flex-1 flex flex-col overflow-hidden bg-white min-w-0">
          <ChartDynamicControls
            dynamicFilters={dynamicFilters}
            dynamicFilterValues={dynamicFilterValues}
            onDynamicFilterChange={(field, values) => {
              setDynamicFilterValues(prev => ({ ...prev, [field]: values }));
            }}
            drilldownConfig={chartTypeUsesNoDimensions(chartType) ? undefined : drilldownConfig}
            selectedDrilldownDimensions={chartTypeUsesNoDimensions(chartType) ? [] : selectedDrilldownDimensions}
            onDrilldownChange={setSelectedDrilldownDimensions}
            availableFields={selectedCube?.dimensions ?? []}
            availableDimensions={selectedCube?.dimensions ?? []}
            isEditMode={false}
          />

          <div
            className={`flex-1 min-h-0 p-4 ${
              chartType === 'rtf-text' ? 'flex flex-col overflow-visible' : 'overflow-auto'
            }`}
          >
            {queryError ? (
              <div className="text-sm text-red-500 text-center py-8">{queryError}</div>
            ) : queryData.length > 0 ? (
              chartType === 'rtf-text' ? (
                <div className="mb-auto w-full shrink-0">
                  <ChartRenderer
                    chartType={chartType}
                    data={queryData}
                    dimensions={[]}
                    metrics={metrics}
                    rtfTextConfig={rtfTextConfig}
                  />
                </div>
              ) : (
                <ChartRenderer
                  chartType={chartType}
                  data={queryData}
                  dimensions={chartTypeUsesNoDimensions(chartType) ? [] : dimensions}
                  metrics={metrics}
                />
              )
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-gray-300 min-h-[120px]">
                <BarChart3Icon className="size-12 mb-3" />
                <p className="text-sm">
                  {chartType === 'rtf-text'
                    ? '在插值模板中填写要展示的文本（可无指标，纯静态）后运行查询'
                    : chartType === 'number'
                      ? '配置至少一个指标后运行查询'
                      : '配置维度和指标后运行查询'}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {!isEmbed && pinDialogMode != null && (
        <PinToDashboardDialog
          open
          onClose={() => setPinDialogMode(null)}
          onPin={handlePinDialogConfirm}
          chartName={chartName}
          hideChartNameInput={chartType === 'rtf-text'}
          lockedDashboardId={pinDialogMode === 'update' ? sourceDashboardId : null}
          dialogTitle={pinDialogMode === 'update' ? '更新看板图表' : 'Pin 到看板'}
          confirmButtonLabel={pinDialogMode === 'update' ? '确认更新' : '确认 Pin'}
        />
      )}
    </div>
  );
}
