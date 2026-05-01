import { useState } from 'react';
import { CalendarIcon } from 'lucide-react';

type RangeMode = 'preset' | 'relative' | 'absolute';

interface PresetRange {
  label: string;
  getRange: () => [Date, Date];
}

const PRESET_RANGES: PresetRange[] = [
  {
    label: '近7天',
    getRange: () => {
      const end = new Date();
      const start = new Date();
      start.setDate(start.getDate() - 7);
      return [start, end];
    },
  },
  {
    label: '近14天',
    getRange: () => {
      const end = new Date();
      const start = new Date();
      start.setDate(start.getDate() - 14);
      return [start, end];
    },
  },
  {
    label: '近30天',
    getRange: () => {
      const end = new Date();
      const start = new Date();
      start.setDate(start.getDate() - 30);
      return [start, end];
    },
  },
  {
    label: '近90天',
    getRange: () => {
      const end = new Date();
      const start = new Date();
      start.setDate(start.getDate() - 90);
      return [start, end];
    },
  },
  {
    label: '近365天',
    getRange: () => {
      const end = new Date();
      const start = new Date();
      start.setDate(start.getDate() - 365);
      return [start, end];
    },
  },
  {
    label: '本月',
    getRange: () => {
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      return [start, now];
    },
  },
  {
    label: '上月',
    getRange: () => {
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end = new Date(now.getFullYear(), now.getMonth(), 0);
      return [start, end];
    },
  },
  {
    label: '本季度',
    getRange: () => {
      const now = new Date();
      const quarter = Math.floor(now.getMonth() / 3);
      const start = new Date(now.getFullYear(), quarter * 3, 1);
      return [start, now];
    },
  },
  {
    label: '本年',
    getRange: () => {
      const now = new Date();
      const start = new Date(now.getFullYear(), 0, 1);
      return [start, now];
    },
  },
];

const RELATIVE_UNITS = [
  { value: 'days', label: '天' },
  { value: 'weeks', label: '周' },
  { value: 'months', label: '月' },
  { value: 'quarters', label: '季度' },
  { value: 'years', label: '年' },
] as const;

type RelativeUnit = typeof RELATIVE_UNITS[number]['value'];

interface TimeRangeFilterProps {
  value: string[];
  onChange: (values: string[]) => void;
  size?: 'default' | 'sm';
}

function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function subtractRelative(amount: number, unit: RelativeUnit, from: Date): Date {
  const result = new Date(from);
  switch (unit) {
    case 'days': result.setDate(result.getDate() - amount); break;
    case 'weeks': result.setDate(result.getDate() - amount * 7); break;
    case 'months': result.setMonth(result.getMonth() - amount); break;
    case 'quarters': result.setMonth(result.getMonth() - amount * 3); break;
    case 'years': result.setFullYear(result.getFullYear() - amount); break;
  }
  return result;
}

export function TimeRangeFilter({ value, onChange, size = 'default' }: TimeRangeFilterProps): React.JSX.Element {
  const [mode, setMode] = useState<RangeMode>('preset');
  const [relativeAmount, setRelativeAmount] = useState(7);
  const [relativeUnit, setRelativeUnit] = useState<RelativeUnit>('days');
  const [absoluteStart, setAbsoluteStart] = useState(value.length >= 1 ? value[0] : '');
  const [absoluteEnd, setAbsoluteEnd] = useState(value.length >= 2 ? value[1] : '');

  const isSm = size === 'sm';

  const applyRange = (start: Date, end: Date) => {
    onChange([formatDate(start), formatDate(end)]);
  };

  const handlePresetClick = (preset: PresetRange) => {
    const [start, end] = preset.getRange();
    applyRange(start, end);
  };

  const handleRelativeApply = () => {
    const end = new Date();
    const start = subtractRelative(relativeAmount, relativeUnit, end);
    applyRange(start, end);
  };

  const handleAbsoluteApply = () => {
    if (absoluteStart && absoluteEnd) {
      onChange([absoluteStart, absoluteEnd]);
    }
  };

  const clear = () => {
    onChange([]);
    setAbsoluteStart('');
    setAbsoluteEnd('');
  };

  return (
    <div className="space-y-3">
      <div className="flex border-b border-gray-200">
        {([
          { key: 'preset' as RangeMode, label: '预设' },
          { key: 'relative' as RangeMode, label: '相对' },
          { key: 'absolute' as RangeMode, label: '绝对' },
        ]).map(tab => (
          <button
            key={tab.key}
            onClick={() => setMode(tab.key)}
            className={`px-3 py-1.5 text-xs font-medium transition-colors ${
              mode === tab.key
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {value.length === 2 && (
        <div className="flex items-center gap-1.5 bg-blue-50 border border-blue-200 rounded-md px-2 py-1">
          <CalendarIcon className="size-3 text-blue-500 shrink-0" />
          <span className={`text-blue-700 ${isSm ? 'text-xs' : 'text-sm'}`}>
            {value[0]} ~ {value[1]}
          </span>
          <button onClick={clear} className="ml-auto text-blue-400 hover:text-red-500 transition-colors">
            ×
          </button>
        </div>
      )}

      {mode === 'preset' && (
        <div className="grid grid-cols-3 gap-1.5">
          {PRESET_RANGES.map(preset => (
            <button
              key={preset.label}
              onClick={() => handlePresetClick(preset)}
              className={`px-2 py-1.5 text-xs rounded-md border transition-colors ${
                isSm ? 'py-1' : ''
              } border-gray-200 text-gray-600 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-600`}
            >
              {preset.label}
            </button>
          ))}
        </div>
      )}

      {mode === 'relative' && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className={`text-gray-500 ${isSm ? 'text-xs' : 'text-sm'}`}>过去</span>
            <input
              type="number"
              min={1}
              value={relativeAmount}
              onChange={e => setRelativeAmount(Math.max(1, parseInt(e.target.value) || 1))}
              className={`w-16 border border-gray-300 rounded-md text-center focus:outline-none focus:ring-1 focus:ring-blue-400 ${
                isSm ? 'px-1 py-0.5 text-xs' : 'px-2 py-1 text-sm'
              }`}
            />
            <select
              value={relativeUnit}
              onChange={e => setRelativeUnit(e.target.value as RelativeUnit)}
              className={`border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-400 ${
                isSm ? 'px-1 py-0.5 text-xs' : 'px-2 py-1 text-sm'
              }`}
            >
              {RELATIVE_UNITS.map(u => (
                <option key={u.value} value={u.value}>{u.label}</option>
              ))}
            </select>
          </div>
          <button
            onClick={handleRelativeApply}
            className={`w-full bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors ${
              isSm ? 'px-2 py-1 text-xs' : 'px-3 py-1.5 text-sm'
            }`}
          >
            应用
          </button>
        </div>
      )}

      {mode === 'absolute' && (
        <div className="space-y-2">
          <div className="space-y-1.5">
            <div>
              <label className={`text-gray-500 block mb-0.5 ${isSm ? 'text-xs' : 'text-xs'}`}>开始日期</label>
              <input
                type="date"
                value={absoluteStart}
                onChange={e => setAbsoluteStart(e.target.value)}
                className={`w-full border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-400 ${
                  isSm ? 'px-1.5 py-0.5 text-xs' : 'px-2 py-1 text-sm'
                }`}
              />
            </div>
            <div>
              <label className={`text-gray-500 block mb-0.5 ${isSm ? 'text-xs' : 'text-xs'}`}>结束日期</label>
              <input
                type="date"
                value={absoluteEnd}
                onChange={e => setAbsoluteEnd(e.target.value)}
                min={absoluteStart || undefined}
                className={`w-full border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-400 ${
                  isSm ? 'px-1.5 py-0.5 text-xs' : 'px-2 py-1 text-sm'
                }`}
              />
            </div>
          </div>
          <button
            onClick={handleAbsoluteApply}
            disabled={!absoluteStart || !absoluteEnd}
            className={`w-full bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed ${
              isSm ? 'px-2 py-1 text-xs' : 'px-3 py-1.5 text-sm'
            }`}
          >
            应用
          </button>
        </div>
      )}
    </div>
  );
}
