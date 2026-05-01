import { XIcon, ClockIcon } from 'lucide-react';
import { Select } from '../ui/select';
import type { DimensionConfig, TimeGranularity } from '../../types/chart';

interface DimensionDropZoneProps {
  dimensions: DimensionConfig[];
  onChange: (dimensions: DimensionConfig[]) => void;
}

const GRANULARITY_OPTIONS: { value: TimeGranularity; label: string }[] = [
  { value: 'year', label: '年' },
  { value: 'quarter', label: '季度' },
  { value: 'month', label: '月' },
  { value: 'week', label: '周' },
  { value: 'day', label: '日' },
  { value: 'hour', label: '时' },
  { value: 'minute', label: '分' },
];

function isTimeType(type: string): boolean {
  const lower = type.toLowerCase();
  return lower.includes('time') || lower.includes('date') || lower.includes('timestamp');
}

export function DimensionDropZone({ dimensions, onChange }: DimensionDropZoneProps): React.JSX.Element {
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      const data = JSON.parse(e.dataTransfer.getData('application/json'));
      if (data.memberType !== 'dimension') return;
      // Avoid duplicates
      if (dimensions.some(d => d.field === data.name)) return;

      const newDim: DimensionConfig = {
        field: data.name,
        title: data.title || data.name,
        type: data.type,
      };

      // If time type, default granularity to day
      if (isTimeType(data.type)) {
        newDim.timeGranularity = 'day';
      }

      onChange([...dimensions, newDim]);
    } catch {}
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };

  const removeDimension = (index: number) => {
    onChange(dimensions.filter((_, i) => i !== index));
  };

  const updateGranularity = (index: number, granularity: TimeGranularity) => {
    onChange(dimensions.map((d, i) => i === index ? { ...d, timeGranularity: granularity } : d));
  };

  return (
    <div
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      className={`min-h-[60px] rounded-lg border-2 border-dashed p-2 transition-colors ${
        dimensions.length === 0 ? 'border-gray-200 bg-gray-50' : 'border-blue-200 bg-blue-50/50'
      }`}
    >
      <div className="text-xs font-medium text-gray-400 mb-1.5">维度</div>
      {dimensions.length === 0 ? (
        <div className="text-xs text-gray-300 text-center py-2">拖入维度字段</div>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {dimensions.map((dim, idx) => (
            <div key={dim.field} className="flex items-center gap-1 bg-white border border-blue-200 rounded-md px-2 py-1 text-xs shadow-sm">
              {isTimeType(dim.type || '') && <ClockIcon className="size-3 text-orange-500" />}
              <span className="text-gray-700">{dim.title || dim.field}</span>
              {isTimeType(dim.type || '') && (
                <Select
                  value={dim.timeGranularity || 'day'}
                  onChange={val => updateGranularity(idx, val as TimeGranularity)}
                  options={GRANULARITY_OPTIONS}
                  size="sm"
                  className="ml-1"
                />
              )}
              <button
                onClick={() => removeDimension(idx)}
                className="ml-0.5 text-gray-400 hover:text-red-500 transition-colors"
              >
                <XIcon className="size-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
