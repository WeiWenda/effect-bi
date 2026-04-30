import { TableIcon, LineChartIcon, PieChartIcon, HashIcon, BarChart3Icon, FunnelIcon, MapIcon } from 'lucide-react';
import type { ChartType } from '../../types/chart';

interface ChartTypeSelectorProps {
  value: ChartType;
  onChange: (type: ChartType) => void;
}

const CHART_TYPES: { type: ChartType; label: string; icon: React.ReactNode }[] = [
  { type: 'table', label: '表格', icon: <TableIcon className="size-4" /> },
  { type: 'line', label: '线图', icon: <LineChartIcon className="size-4" /> },
  { type: 'bar', label: '柱状图', icon: <BarChart3Icon className="size-4" /> },
  { type: 'pie', label: '饼图', icon: <PieChartIcon className="size-4" /> },
  { type: 'funnel', label: '漏斗图', icon: <FunnelIcon className="size-4" /> },
  { type: 'map', label: '地图', icon: <MapIcon className="size-4" /> },
  { type: 'number', label: '数字', icon: <HashIcon className="size-4" /> },
];

export function ChartTypeSelector({ value, onChange }: ChartTypeSelectorProps): React.JSX.Element {
  return (
    <div className="grid grid-cols-4 gap-2">
      {CHART_TYPES.map(ct => (
        <button
          key={ct.type}
          onClick={() => onChange(ct.type)}
          className={`flex flex-col items-center justify-center p-3 rounded-lg border transition-colors ${
            value === ct.type
              ? 'bg-blue-50 border-blue-300 text-blue-700'
              : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'
          }`}
          title={ct.label}
        >
          <div className={`p-2 rounded-lg mb-1.5 ${
            value === ct.type ? 'bg-blue-100' : 'bg-gray-100'
          }`}>
            {ct.icon}
          </div>
          <span className="text-xs font-medium">{ct.label}</span>
        </button>
      ))}
    </div>
  );
}
