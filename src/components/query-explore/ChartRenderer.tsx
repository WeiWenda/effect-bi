import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import type { ChartType } from '../../types/chart';

const COLORS = ['#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];

interface ChartRendererProps {
  chartType: ChartType;
  data: any[];
  dimensions: { field: string; title?: string }[];
  metrics: { field: string; title?: string }[];
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
  if (data.length === 0) {
    return <div className="text-sm text-gray-400 text-center py-8">无数据</div>;
  }

  const xKey = dimensions[0]?.field;

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis dataKey={xKey} tick={{ fontSize: 12 }} />
        <YAxis tick={{ fontSize: 12 }} />
        <Tooltip />
        <Legend />
        {metrics.map((metric, idx) => (
          <Line
            key={metric.field}
            type="monotone"
            dataKey={metric.field}
            name={metric.title || metric.field}
            stroke={COLORS[idx % COLORS.length]}
            strokeWidth={2}
            dot={data.length < 50}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

function BarChartRenderer({ data, dimensions, metrics }: Omit<ChartRendererProps, 'chartType'>): React.JSX.Element {
  if (data.length === 0) {
    return <div className="text-sm text-gray-400 text-center py-8">无数据</div>;
  }

  const xKey = dimensions[0]?.field;

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis dataKey={xKey} tick={{ fontSize: 12 }} />
        <YAxis tick={{ fontSize: 12 }} />
        <Tooltip />
        <Legend />
        {metrics.map((metric, idx) => (
          <Bar
            key={metric.field}
            dataKey={metric.field}
            name={metric.title || metric.field}
            fill={COLORS[idx % COLORS.length]}
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

  const nameKey = dimensions[0]?.field;
  const valueKey = metrics[0]?.field;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie
          data={data}
          dataKey={valueKey}
          nameKey={nameKey}
          cx="50%"
          cy="50%"
          outerRadius="70%"
          label={({ name, percent }: any) => `${name}: ${(percent * 100).toFixed(0)}%`}
          labelLine={false}
        >
          {data.map((_, idx) => (
            <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip />
        <Legend />
      </PieChart>
    </ResponsiveContainer>
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

export function ChartRenderer({ chartType, data, dimensions, metrics }: ChartRendererProps): React.JSX.Element {
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
    default:
      return <div className="text-sm text-gray-400 text-center py-8">不支持的图表类型</div>;
  }
}
