import {
  TableIcon,
  LineChartIcon,
  PieChartIcon,
  HashIcon,
  BarChart3Icon,
  FunnelIcon,
  MapIcon,
  ScrollTextIcon,
} from 'lucide-react';
import { type ChartType, isVisualQueryChartTypeDisabled } from '../../types/chart';

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
  { type: 'rtf-text', label: '文本', icon: <ScrollTextIcon className="size-4" /> },
];

export function ChartTypeSelector({ value, onChange }: ChartTypeSelectorProps): React.JSX.Element {
  return (
    <div className="grid grid-cols-4 gap-2">
      {CHART_TYPES.map(ct => {
        const disabled = isVisualQueryChartTypeDisabled(ct.type);
        const selected = value === ct.type;
        return (
          <button
            key={ct.type}
            type="button"
            disabled={disabled}
            onClick={() => {
              if (!disabled) onChange(ct.type);
            }}
            className={`flex flex-col items-center justify-center p-3 rounded-lg border transition-colors ${
              disabled
                ? 'cursor-not-allowed border-gray-100 bg-gray-50 text-gray-400 opacity-70'
                : selected
                  ? 'bg-blue-50 border-blue-300 text-blue-700'
                  : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'
            }`}
            title={ct.label}
          >
            <div
              className={`p-2 rounded-lg mb-1.5 ${
                disabled ? 'bg-gray-100 text-gray-400' : selected ? 'bg-blue-100' : 'bg-gray-100'
              }`}
            >
              {ct.icon}
            </div>
            <span className="text-xs font-medium">{ct.label}</span>
          </button>
        );
      })}
    </div>
  );
}
