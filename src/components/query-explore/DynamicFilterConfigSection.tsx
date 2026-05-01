import { useState } from 'react';
import { XIcon, PencilIcon, PlusIcon, SlidersHorizontalIcon, ClockIcon, HashIcon, TypeIcon } from 'lucide-react';
import { Select } from '../ui/select';
import { TimeRangeFilter } from './TimeRangeFilter';
import type { DynamicFilterConfig, FilterOperator } from '../../types/chart';

const STRING_OPERATORS: { value: FilterOperator; label: string }[] = [
  { value: 'equals', label: '等于' },
  { value: 'notEquals', label: '不等于' },
  { value: 'contains', label: '包含' },
  { value: 'notContains', label: '不包含' },
  { value: 'set', label: '有值' },
  { value: 'notSet', label: '无值' },
];

const NUMBER_OPERATORS: { value: FilterOperator; label: string }[] = [
  { value: 'equals', label: '等于' },
  { value: 'notEquals', label: '不等于' },
  { value: 'gt', label: '大于' },
  { value: 'gte', label: '大于等于' },
  { value: 'lt', label: '小于' },
  { value: 'lte', label: '小于等于' },
  { value: 'set', label: '有值' },
  { value: 'notSet', label: '无值' },
];

const TIME_OPERATORS: { value: FilterOperator; label: string }[] = [
  { value: 'inDateRange', label: '在范围内' },
  { value: 'notInDateRange', label: '不在范围内' },
  { value: 'set', label: '有值' },
  { value: 'notSet', label: '无值' },
];

function getOperatorsForType(type: string): { value: FilterOperator; label: string }[] {
  const lower = type.toLowerCase();
  if (lower.includes('time') || lower.includes('date') || lower.includes('timestamp')) return TIME_OPERATORS;
  if (lower.includes('int') || lower.includes('decimal') || lower.includes('float') || lower.includes('double') || lower.includes('numeric') || lower === 'number') return NUMBER_OPERATORS;
  return STRING_OPERATORS;
}

function isTimeType(type: string): boolean {
  const lower = type.toLowerCase();
  return lower.includes('time') || lower.includes('date') || lower.includes('timestamp');
}

function isNumberType(type: string): boolean {
  const lower = type.toLowerCase();
  return lower.includes('int') || lower.includes('decimal') || lower.includes('float') || lower.includes('double') || lower.includes('numeric') || lower === 'number';
}

function isNoValueOperator(op: FilterOperator): boolean {
  return op === 'set' || op === 'notSet';
}

function isRangeOperator(op: FilterOperator): boolean {
  return op === 'inDateRange' || op === 'notInDateRange';
}

function getOperatorLabel(op: FilterOperator): string {
  const all = [...STRING_OPERATORS, ...NUMBER_OPERATORS, ...TIME_OPERATORS];
  return all.find(o => o.value === op)?.label || op;
}

function FieldTypeIcon({ type }: { type: string }) {
  if (isTimeType(type)) return <ClockIcon className="size-3 text-orange-500 shrink-0" />;
  if (isNumberType(type)) return <HashIcon className="size-3 text-green-500 shrink-0" />;
  return <TypeIcon className="size-3 text-blue-400 shrink-0" />;
}

interface DynamicFilterConfigSectionProps {
  dynamicFilters: DynamicFilterConfig[];
  onDynamicFiltersChange: (filters: DynamicFilterConfig[]) => void;
  availableFields: { name: string; title: string; shortTitle?: string; type: string }[];
}

export function DynamicFilterConfigSection({
  dynamicFilters,
  onDynamicFiltersChange,
  availableFields,
}: DynamicFilterConfigSectionProps): React.JSX.Element {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [draft, setDraft] = useState<DynamicFilterConfig | null>(null);

  const handleRemove = (index: number) => {
    onDynamicFiltersChange(dynamicFilters.filter((_, i) => i !== index));
  };

  const handleOpenAdd = () => {
    if (availableFields.length === 0) return;
    const field = availableFields[0];
    const operators = getOperatorsForType(field.type);
    setDraft({
      field: field.name,
      title: field.shortTitle || field.title || field.name,
      shortTitle: field.shortTitle,
      type: field.type,
      operator: operators[0].value,
      defaultValues: [],
    });
    setEditingIndex(-1);
  };

  const handleOpenEdit = (index: number) => {
    setDraft({ ...dynamicFilters[index], defaultValues: [...(dynamicFilters[index].defaultValues || [])] });
    setEditingIndex(index);
  };

  const handleSave = () => {
    if (!draft || editingIndex === null) return;
    if (editingIndex === -1) {
      onDynamicFiltersChange([...dynamicFilters, draft]);
    } else {
      onDynamicFiltersChange(dynamicFilters.map((f, i) => i === editingIndex ? draft : f));
    }
    setEditingIndex(null);
    setDraft(null);
  };

  const handleCancel = () => {
    setEditingIndex(null);
    setDraft(null);
  };

  const handleFieldChange = (fieldName: string) => {
    const field = availableFields.find(f => f.name === fieldName);
    if (!field) return;
    const operators = getOperatorsForType(field.type);
    setDraft({
      ...draft!,
      field: field.name,
      title: field.shortTitle || field.title || field.name,
      shortTitle: field.shortTitle,
      type: field.type,
      operator: operators[0].value,
      defaultValues: [],
    });
  };

  const handleDefaultValueChange = (valueStr: string) => {
    if (!draft) return;
    const values = valueStr ? [valueStr] : [];
    setDraft({ ...draft, defaultValues: values.length > 0 ? values : undefined });
  };

  const isTimeRangeMode = draft && isTimeType(draft.type || '') && isRangeOperator(draft.operator);

  return (
    <div>
      <div className="flex items-center justify-between">
        <div className="text-xs font-medium text-gray-400">动态过滤器</div>
        <button
          onClick={handleOpenAdd}
          disabled={availableFields.length === 0}
          className="flex items-center gap-1 text-xs text-blue-500 hover:text-blue-600 disabled:text-gray-300 disabled:cursor-not-allowed transition-colors"
        >
          <PlusIcon className="size-3" />
          添加
        </button>
      </div>

      {dynamicFilters.length === 0 && (
        <div className="text-xs text-gray-300 text-center py-2">无动态过滤器</div>
      )}

      {dynamicFilters.map((filter, idx) => (
        <div key={filter.field} className="flex items-center gap-1.5 bg-blue-50 border border-blue-200 rounded-md px-2.5 py-1.5 text-xs group mt-1.5">
          <FieldTypeIcon type={filter.type || ''} />
          <span className="flex-1 text-blue-700 truncate">
            {filter.shortTitle || filter.title || filter.field} {getOperatorLabel(filter.operator)}
            {filter.defaultValues && filter.defaultValues.length > 0 && (
              isRangeOperator(filter.operator) && filter.defaultValues.length === 2
                ? ` ${filter.defaultValues[0]} ~ ${filter.defaultValues[1]}`
                : ` ${filter.defaultValues.join(',')}`
            )}
          </span>
          <button
            onClick={() => handleOpenEdit(idx)}
            className="text-blue-300 hover:text-blue-500 transition-colors shrink-0"
          >
            <PencilIcon className="size-3" />
          </button>
          <button
            onClick={() => handleRemove(idx)}
            className="text-blue-300 hover:text-red-500 transition-colors shrink-0"
          >
            <XIcon className="size-3" />
          </button>
        </div>
      ))}

      {editingIndex !== null && draft && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={handleCancel}>
          <div className="bg-white rounded-lg shadow-xl p-5 w-[600px] space-y-4" onClick={e => e.stopPropagation()}>
            <div className="text-sm font-semibold text-gray-700">
              {editingIndex === -1 ? '添加动态过滤器' : '编辑动态过滤器'}
            </div>

            <div className="flex items-end gap-3">
              <div className="flex-1">
                <label className="text-xs text-gray-500 mb-1 block">字段</label>
                <div className="relative">
                  <Select
                    value={draft.field}
                    onChange={val => val && handleFieldChange(val)}
                    options={availableFields.map(f => ({
                      value: f.name,
                      label: f.shortTitle || f.title || f.name,
                      icon: isTimeType(f.type) ? <ClockIcon className="size-3.5 text-orange-500" /> : isNumberType(f.type) ? <HashIcon className="size-3.5 text-green-500" /> : <TypeIcon className="size-3.5 text-blue-500" />,
                    }))}
                    placeholder="选择字段"
                    size="sm"
                  />
                </div>
              </div>

              <div className="flex-1">
                <label className="text-xs text-gray-500 mb-1 block">操作符</label>
                <div className="relative">
                  <Select
                    value={draft.operator}
                    onChange={val => val && setDraft({ ...draft, operator: val as FilterOperator, defaultValues: [] })}
                    options={getOperatorsForType(draft.type || 'string')}
                    placeholder="选择操作符"
                    size="sm"
                  />
                </div>
              </div>

              {!isNoValueOperator(draft.operator) && (
                <div className="flex-1">
                  <label className="text-xs text-gray-500 mb-1 block">默认值</label>
                  {isTimeRangeMode ? (
                    <div className="relative">
                      <TimeRangeFilter
                        value={draft.defaultValues || []}
                        onChange={values => setDraft({ ...draft, defaultValues: values.length > 0 ? values : undefined })}
                      />
                    </div>
                  ) : (
                    <input
                      type={isNumberType(draft.type || '') ? 'number' : 'text'}
                      value={draft.defaultValues?.join(', ') || ''}
                      onChange={e => handleDefaultValueChange(e.target.value)}
                      placeholder="输入默认值"
                      className="w-full border border-gray-300 rounded-md px-1.5 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
                    />
                  )}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button
                onClick={handleCancel}
                className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleSave}
                className="px-3 py-1.5 text-sm bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors"
              >
                确定
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
