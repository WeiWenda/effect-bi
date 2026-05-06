import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import type { ChartType, MetricConfig, RtfTextChartConfig } from '../../types/chart';
import {
  borderColorForBackground,
  interpolateMetricTemplate,
  normalizeRtfTextChartConfig,
} from '../../utils/rtfTextInterpolation';

const RTF_TEXT_DISPLAY_FONT =
  'system-ui, "Microsoft YaHei", "PingFang SC", "Noto Sans SC", sans-serif';

const COLORS = ['#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];

interface ChartDimensionCol {
  field: string;
  title?: string;
  timeGranularity?: string;
}

interface ChartRendererProps {
  chartType: ChartType;
  data: any[];
  dimensions: ChartDimensionCol[];
  metrics: { field: string; title?: string }[];
  /** chartType 为 rtf-text 时使用 */
  rtfTextConfig?: RtfTextChartConfig;
}

/** Cube 结果里时间维度常为 `member.granularity`，与配置里的 `field` 对齐 */
function cubeRowKeyForDimension(dim: ChartDimensionCol, sampleRow: Record<string, unknown>): string {
  if (dim.timeGranularity) {
    const withGran = `${dim.field}.${dim.timeGranularity}`;
    if (withGran in sampleRow) return withGran;
  }
  return dim.field;
}

function parseMeasureValue(v: unknown): number | null {
  if (v == null || v === '') return null;
  if (typeof v === 'number' && !Number.isNaN(v)) return v;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function compareXValues(a: unknown, b: unknown): number {
  const sa = a == null ? '' : String(a);
  const sb = b == null ? '' : String(b);
  const da = Date.parse(sa);
  const db = Date.parse(sb);
  if (!Number.isNaN(da) && !Number.isNaN(db) && sa.includes('T')) return da - db;
  return sa.localeCompare(sb);
}

const SERIES_PART_SEP = '\u001f';

function seriesTupleKey(row: Record<string, unknown>, splitDims: ChartDimensionCol[], sampleRow: Record<string, unknown>): string {
  return splitDims
    .map(d => {
      const k = cubeRowKeyForDimension(d, sampleRow);
      const v = row[k];
      return v == null ? '' : String(v);
    })
    .join(SERIES_PART_SEP);
}

function formatSeriesLegendLabel(tupleKey: string, splitDims: ChartDimensionCol[]): string {
  const parts = tupleKey.split(SERIES_PART_SEP);
  return splitDims
    .map((d, i) => {
      const label = d.title || d.field;
      const v = parts[i] ?? '';
      return v === '' ? label : `${label}: ${v}`;
    })
    .join(' · ');
}

function TableRenderer({ data, dimensions, metrics }: Omit<ChartRendererProps, 'chartType'>): React.JSX.Element {
  if (data.length === 0) {
    return <div className="text-sm text-gray-400 text-center py-8">无数据</div>;
  }

  const allColumns = [...dimensions, ...metrics];

  return (
    <div className="overflow-auto h-full">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 sticky top-0">
          <tr>
            {allColumns.map(col => (
              <th key={col.field} className="px-3 py-2 text-left text-xs font-medium text-gray-500 border-b">
                {col.title || col.field}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, idx) => (
            <tr key={idx} className="border-b border-gray-100 hover:bg-gray-50">
              {allColumns.map(col => (
                <td key={col.field} className="px-3 py-2 text-gray-700">
                  {row[col.field] != null ? String(row[col.field]) : '-'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LineChartRenderer({ data, dimensions, metrics }: Omit<ChartRendererProps, 'chartType'>): React.JSX.Element {
  if (data.length === 0 || metrics.length === 0) {
    return <div className="text-sm text-gray-400 text-center py-8">无数据</div>;
  }

  const sampleRow = (data[0] ?? {}) as Record<string, unknown>;
  const xDim = dimensions[0];
  if (!xDim) {
    return <div className="text-sm text-gray-400 text-center py-8">请配置横轴维度</div>;
  }
  const xKey = cubeRowKeyForDimension(xDim, sampleRow);
  const splitDims = dimensions.length > 1 ? dimensions.slice(1) : [];

  // 仅首维为 X（时间）：多分类维时透视成宽表，每条线 = 其余维度取值组合 × 指标
  let chartData: Record<string, unknown>[];
  let lineDefs: { key: string; dataKey: string; name: string; colorIndex: number }[];

  if (splitDims.length === 0) {
    chartData = [...data].sort((a, b) => compareXValues(a[xKey], b[xKey]));
    lineDefs = metrics.map((metric, idx) => ({
      key: metric.field,
      dataKey: metric.field,
      name: metric.title || metric.field,
      colorIndex: idx,
    }));
  } else {
    const uniqueTimes = [...new Set(data.map(r => r[xKey]))].sort(compareXValues);
    const seriesKeys = [...new Set(data.map(r => seriesTupleKey(r as Record<string, unknown>, splitDims, sampleRow)))].sort(
      (a, b) => a.localeCompare(b)
    );

    lineDefs = [];
    let ln = 0;
    for (const sk of seriesKeys) {
      for (const m of metrics) {
        lineDefs.push({
          key: `__ln_${ln}`,
          dataKey: `__ln_${ln}`,
          name:
            metrics.length > 1
              ? `${formatSeriesLegendLabel(sk, splitDims)} · ${m.title || m.field}`
              : formatSeriesLegendLabel(sk, splitDims),
          colorIndex: ln,
        });
        ln++;
      }
    }

    chartData = uniqueTimes.map(t => {
      const row: Record<string, unknown> = { [xKey]: t };
      let i = 0;
      for (const sk of seriesKeys) {
        for (const m of metrics) {
          const src = data.find(
            r =>
              r[xKey] === t &&
              seriesTupleKey(r as Record<string, unknown>, splitDims, sampleRow) === sk
          ) as Record<string, unknown> | undefined;
          row[`__ln_${i}`] = src != null ? parseMeasureValue(src[m.field]) : null;
          i++;
        }
      }
      return row;
    });
  }

  const dot = chartData.length < 50;

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis dataKey={xKey} tick={{ fontSize: 12 }} />
        <YAxis tick={{ fontSize: 12 }} />
        <Tooltip />
        <Legend />
        {lineDefs.map(def => (
          <Line
            key={def.key}
            type="monotone"
            dataKey={def.dataKey}
            name={def.name}
            stroke={COLORS[def.colorIndex % COLORS.length]}
            strokeWidth={2}
            dot={dot}
            connectNulls
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

function BarChartRenderer({ data, dimensions, metrics }: Omit<ChartRendererProps, 'chartType'>): React.JSX.Element {
  if (data.length === 0 || metrics.length === 0) {
    return <div className="text-sm text-gray-400 text-center py-8">无数据</div>;
  }

  const sampleRow = (data[0] ?? {}) as Record<string, unknown>;
  const xDim = dimensions[0];
  if (!xDim) {
    return <div className="text-sm text-gray-400 text-center py-8">请配置横轴维度</div>;
  }
  const xKey = cubeRowKeyForDimension(xDim, sampleRow);
  /** 与查询构建一致：带 timeGranularity 的维度走 Cube timeDimensions，结果列为 `field.granularity` */
  const isTimeFirst = Boolean(xDim.timeGranularity);
  const splitDims = dimensions.length > 1 ? dimensions.slice(1) : [];

  let chartData: Record<string, unknown>[];
  let barDefs: { key: string; dataKey: string; name: string; colorIndex: number }[];

  if (isTimeFirst) {
    if (splitDims.length === 0) {
      chartData = [...data].sort((a, b) => compareXValues(a[xKey], b[xKey]));
      barDefs = metrics.map((metric, idx) => ({
        key: metric.field,
        dataKey: metric.field,
        name: metric.title || metric.field,
        colorIndex: idx,
      }));
    } else {
      const uniqueTimes = [...new Set(data.map(r => r[xKey]))].sort(compareXValues);
      const seriesKeys = [...new Set(data.map(r => seriesTupleKey(r as Record<string, unknown>, splitDims, sampleRow)))].sort(
        (a, b) => a.localeCompare(b)
      );

      barDefs = [];
      let bi = 0;
      for (const sk of seriesKeys) {
        for (const m of metrics) {
          barDefs.push({
            key: `__br_${bi}`,
            dataKey: `__br_${bi}`,
            name:
              metrics.length > 1
                ? `${formatSeriesLegendLabel(sk, splitDims)} · ${m.title || m.field}`
                : formatSeriesLegendLabel(sk, splitDims),
            colorIndex: bi,
          });
          bi++;
        }
      }

      chartData = uniqueTimes.map(t => {
        const row: Record<string, unknown> = { [xKey]: t };
        let i = 0;
        for (const sk of seriesKeys) {
          for (const m of metrics) {
            const src = data.find(
              r =>
                r[xKey] === t &&
                seriesTupleKey(r as Record<string, unknown>, splitDims, sampleRow) === sk
            ) as Record<string, unknown> | undefined;
            row[`__br_${i}`] = src != null ? parseMeasureValue(src[m.field]) : null;
            i++;
          }
        }
        return row;
      });
    }
  } else {
    chartData = [...data].sort((a, b) => compareXValues(a[xKey], b[xKey]));
    barDefs = metrics.map((metric, idx) => ({
      key: metric.field,
      dataKey: metric.field,
      name: metric.title || metric.field,
      colorIndex: idx,
    }));
  }

  /** 首维为时间：略留类目间距便于扫日期，尽量让柱更宽 */
  const barCategoryGap = isTimeFirst ? '12%' : '18%';
  const barGap = isTimeFirst ? 2 : 4;

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart
        data={chartData}
        margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
        barCategoryGap={barCategoryGap}
        barGap={barGap}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis dataKey={xKey} tick={{ fontSize: 12 }} />
        <YAxis tick={{ fontSize: 12 }} />
        <Tooltip />
        <Legend />
        {barDefs.map(def => (
          <Bar
            key={def.key}
            dataKey={def.dataKey}
            name={def.name}
            fill={COLORS[def.colorIndex % COLORS.length]}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

function PieChartRenderer({ data, dimensions, metrics }: Omit<ChartRendererProps, 'chartType'>): React.JSX.Element {
  if (data.length === 0) {
    return <div className="text-sm text-gray-400 text-center py-8">无数据</div>;
  }

  const dim0 = dimensions[0];
  const met0 = metrics[0];
  if (!dim0 || !met0) {
    return <div className="text-sm text-gray-400 text-center py-8">饼图需配置 1 个维度和 1 个指标</div>;
  }

  const sampleRow = (data[0] ?? {}) as Record<string, unknown>;
  const nameKey = cubeRowKeyForDimension(dim0, sampleRow);
  const valueKey = met0.field;
  /** Recharts 3 扇区求和只用 `typeof val === 'number'`；Cube 常返回字符串指标，会导致 sum=0 无法绘制 */
  const pieRows = (data as Record<string, unknown>[]).map(row => {
    const n = parseMeasureValue(row[valueKey]);
    return { ...row, [valueKey]: n ?? 0 };
  });
  const sum = pieRows.reduce((acc, row) => {
    const v = row[valueKey];
    return acc + (typeof v === 'number' && !Number.isNaN(v) ? v : 0);
  }, 0);
  if (sum <= 0) {
    return <div className="text-sm text-gray-400 text-center py-8">指标值无效或均为 0，无法绘制饼图</div>;
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie
          data={pieRows}
          dataKey={valueKey}
          nameKey={nameKey}
          cx="50%"
          cy="50%"
          outerRadius="70%"
          label={({ name, percent }: { name?: unknown; percent?: number }) => {
            const p = typeof percent === 'number' && !Number.isNaN(percent) ? percent * 100 : 0;
            return `${name != null ? String(name) : ''}: ${p.toFixed(0)}%`;
          }}
          labelLine={false}
        >
          {pieRows.map((_, idx) => (
            <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip />
        <Legend />
      </PieChart>
    </ResponsiveContainer>
  );
}

function RtfTextRenderer({
  data,
  metrics,
  rtfTextConfig,
}: {
  data: any[];
  metrics: MetricConfig[];
  rtfTextConfig?: RtfTextChartConfig;
}): React.JSX.Element {
  const cfg = normalizeRtfTextChartConfig(rtfTextConfig);

  if (data.length === 0) {
    return <div className="text-sm text-gray-400 text-center py-8">无数据</div>;
  }

  const row = (data[0] ?? {}) as Record<string, unknown>;
  const display = interpolateMetricTemplate(cfg.interpolationExpression, row);
  const frameBorder = borderColorForBackground(cfg.backgroundColor);

  return (
    <div className="min-h-0 w-full overflow-visible px-2 py-0.5">
      <div
        className="box-border rounded-lg border border-solid px-3 py-1.5 leading-normal shadow-sm"
        style={{
          fontSize: `${cfg.fontSizePx}px`,
          color: cfg.color,
          backgroundColor: cfg.backgroundColor,
          borderColor: frameBorder,
          fontFamily: RTF_TEXT_DISPLAY_FONT,
          whiteSpace: 'pre-wrap',
        }}
      >
        {display || <span className="text-gray-400">（模板为空）</span>}
      </div>
    </div>
  );
}

function NumberRenderer({ data, metrics }: { data: any[]; metrics: { field: string; title?: string }[] }): React.JSX.Element {
  if (data.length === 0 || metrics.length === 0) {
    return <div className="text-sm text-gray-400 text-center py-8">无数据</div>;
  }

  const value = data[0]?.[metrics[0].field];

  return (
    <div className="flex flex-col items-center justify-center h-full">
      <div className="text-4xl font-bold text-gray-800">
        {value != null ? (typeof value === 'number' ? value.toLocaleString() : String(value)) : '-'}
      </div>
      <div className="text-sm text-gray-500 mt-2">{metrics[0].title || metrics[0].field}</div>
    </div>
  );
}

export function ChartRenderer({
  chartType,
  data,
  dimensions,
  metrics,
  rtfTextConfig,
}: ChartRendererProps): React.JSX.Element {
  switch (chartType) {
    case 'table':
      return <TableRenderer data={data} dimensions={dimensions} metrics={metrics} />;
    case 'line':
      return <LineChartRenderer data={data} dimensions={dimensions} metrics={metrics} />;
    case 'bar':
      return <BarChartRenderer data={data} dimensions={dimensions} metrics={metrics} />;
    case 'pie':
      return <PieChartRenderer data={data} dimensions={dimensions} metrics={metrics} />;
    case 'number':
      return <NumberRenderer data={data} metrics={metrics} />;
    case 'rtf-text':
      return <RtfTextRenderer data={data} metrics={metrics as MetricConfig[]} rtfTextConfig={rtfTextConfig} />;
    default:
      return <div className="text-sm text-gray-400 text-center py-8">不支持的图表类型</div>;
  }
}
