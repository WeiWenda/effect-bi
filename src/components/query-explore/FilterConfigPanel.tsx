import { useState } from 'react';
import { PlusIcon, XIcon, PencilIcon } from 'lucide-react';
import { Select } from '../ui/select';
import type { FilterConfig, FilterOperator } from '../../types/chart';

interface FilterConfigPanelProps {
  filters: FilterConfig[];
  onChange: (filters: FilterConfig[]) => void;
  availableFields?: { name: string; title: string; shortTitle?: string; type: string }[];
}

const STRING_OPERATORS: { value: FilterOperator; label: string }[] = [
  { value: 'equals', label: '等于' },
  { value: 'notEquals', label: '不等于' },
  { value: 'contains', label: '包含' },
  { value: 'notContains', label: '不包含' },
  { value: 'in', label: '在列表中' },
  { value: 'notIn', label: '不在列表中' },
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

function isNoValueOperator(op: FilterOperator): boolean {
  return op === 'set' || op === 'notSet';
}

function getOperatorLabel(op: FilterOperator): string {
  const all = [...STRING_OPERATORS, ...NUMBER_OPERATORS, ...TIME_OPERATORS];
  return all.find(o => o.value === op)?.label || op;
}

function formatFilterText(filter: FilterConfig): string {
  const fieldTitle = filter.shortTitle || filter.title || filter.field;
  const opLabel = getOperatorLabel(filter.operator);
  if (isNoValueOperator(filter.operator)) return `${fieldTitle} ${opLabel}`;
  return `${fieldTitle} ${opLabel} ${filter.values.join(', ')}`;
}

export function FilterConfigPanel({ filters, onChange, availableFields = [] }: FilterConfigPanelProps): React.JSX.Element {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [draft, setDraft] = useState<FilterConfig | null>(null);

  const removeFilter = (index: number) => {
    onChange(filters.filter((_, i) => i !== index));
  };

  const openAdd = () => {
    if (availableFields.length === 0) return;
    const field = availableFields[0];
    const operators = getOperatorsForType(field.type);
    setDraft({
      field: field.name,
      title: field.shortTitle || field.title || field.name,
      shortTitle: field.shortTitle,
      type: field.type,
      operator: operators[0].value,
      values: [],
    });
    setEditingIndex(-1);
  };

  const openEdit = (index: number) => {
    setDraft({ ...filters[index] });
    setEditingIndex(index);
  };

  const saveDraft = () => {
    if (!draft) return;
    if (editingIndex === -1) {
      onChange([...filters, draft]);
    } else {
      onChange(filters.map((f, i) => i === editingIndex ? draft : f));
    }
    setEditingIndex(null);
    setDraft(null);
  };

  const cancelEdit = () => {
    setEditingIndex(null);
    setDraft(null);
  };

  const handleDraftFieldChange = (fieldName: string) => {
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
      values: [],
    });
  };

  const handleDraftValueChange = (valueStr: string) => {
    if (!draft) return;
    let values: string[];
    if (isTimeType(draft.type || '') && (draft.operator === 'inDateRange' || draft.operator === 'notInDateRange')) {
      values = valueStr.split(',').map(v => v.trim()).filter(Boolean);
    } else if (draft.operator === 'in' || draft.operator === 'notIn') {
      values = valueStr.split(',').map(v => v.trim()).filter(Boolean);
    } else {
      values = valueStr ? [valueStr] : [];
    }
    setDraft({ ...draft, values });
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <div className="text-xs font-medium text-gray-400">过滤条件</div>
        <button
          onClick={openAdd}
          className="flex items-center gap-1 text-xs text-blue-500 hover:text-blue-600 transition-colors"
        >
          <PlusIcon className="size-3" />
          添加过滤
        </button>
      </div>

      {filters.length === 0 && editingIndex === null && (
        <div className="text-xs text-gray-300 text-center py-2">无过滤条件</div>
      )}

      {filters.map((filter, idx) => (
        <div key={idx} className="flex items-center gap-1.5 bg-white border border-gray-200 rounded-md px-2.5 py-1.5 text-xs group">
          <span className="flex-1 text-gray-700 truncate">{formatFilterText(filter)}</span>
          <button
            onClick={() => openEdit(idx)}
            className="text-gray-300 hover:text-blue-500 transition-colors shrink-0"
          >
            <PencilIcon className="size-3" />
          </button>
          <button
            onClick={() => removeFilter(idx)}
            className="text-gray-300 hover:text-red-500 transition-colors shrink-0"
          >
            <XIcon className="size-3" />
          </button>
        </div>
      ))}

      {editingIndex !== null && draft && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={cancelEdit}>
          <div className="bg-white rounded-lg shadow-xl p-5 w-80 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="text-sm font-semibold text-gray-700">
              {editingIndex === -1 ? '添加过滤条件' : '编辑过滤条件'}
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">字段</label>
                <Select
                  value={draft.field}
                  onChange={val => val && handleDraftFieldChange(val)}
                  options={availableFields.map(f => ({ value: f.name, label: f.shortTitle || f.title || f.name }))}
                  placeholder="选择字段"
                />
              </div>

              <div>
                <label className="text-xs text-gray-500 mb-1 block">操作符</label>
                <Select
                  value={draft.operator}
                  onChange={val => val && setDraft({ ...draft, operator: val as FilterOperator, values: [] })}
                  options={getOperatorsForType(draft.type || 'string')}
                  placeholder="选择操作符"
                />
              </div>

              {!isNoValueOperator(draft.operator) && (
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">值</label>
                  <input
                    type="text"
                    value={draft.values.join(', ')}
                    onChange={e => handleDraftValueChange(e.target.value)}
                    placeholder={isTimeType(draft.type || '') ? '2024-01-01,2024-12-31' : '输入值，多值用逗号分隔'}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                  />
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button
                onClick={cancelEdit}
                className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors"
              >
                取消
              </button>
              <button
                onClick={saveDraft}
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
