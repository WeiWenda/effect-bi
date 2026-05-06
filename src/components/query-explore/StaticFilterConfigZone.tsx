import { useState, useMemo } from 'react';
import { PlusIcon, XIcon, PencilIcon } from 'lucide-react';
import { Select } from '../ui/select';
import { FilterValueBar } from '../filter/FilterValueBar';
import { MemberFieldTypeIcon } from '../filter/MemberFieldTypeIcon';
import { Button } from '@/components/ui/button';
import type { FilterConfig, FilterOperator } from '../../types/chart';
import {
  formatTimeBoundDisplay,
  isTimeRangeSpecComplete,
  migrateLegacyToTimeRange,
} from '../../utils/filterTimeRelative';
import {
  getOperatorLabel,
  getOperatorsForType,
  isNoValueOperator,
  isRangeOperator,
  isTimeType,
} from '../../utils/filterOperatorUi';

export interface StaticFilterConfigZoneProps {
  filters: FilterConfig[];
  onChange: (filters: FilterConfig[]) => void;
  availableFields?: { name: string; title: string; shortTitle?: string; type: string }[];
  /** 当前 Cube 数据集名；用于 string 类型成员 distinct 取值 */
  cubeViewName?: string | null;
}

/** 时间列日期范围：仅「起 ~ 止」，不拼「在范围内」等操作符；支持仅 timeRange、values 为空 */
function formatTimeRangeListSummary(filter: FilterConfig): string | null {
  if (!isTimeType(filter.type || '') || !isRangeOperator(filter.operator)) return null;
  if (filter.values.length === 2) {
    return `${filter.values[0]} ~ ${filter.values[1]}`;
  }
  const spec = migrateLegacyToTimeRange(filter);
  if (spec && isTimeRangeSpecComplete(spec)) {
    return `${formatTimeBoundDisplay(spec.start)} ~ ${formatTimeBoundDisplay(spec.end)}`;
  }
  return null;
}

function formatFilterText(filter: FilterConfig): string {
  const fieldTitle = filter.shortTitle || filter.title || filter.field;
  const opLabel = getOperatorLabel(filter.operator);
  if (isNoValueOperator(filter.operator)) return `${fieldTitle} ${opLabel}`;
  const timeSummary = formatTimeRangeListSummary(filter);
  if (timeSummary != null) return `${fieldTitle} ${timeSummary}`;
  if (isRangeOperator(filter.operator) && filter.values.length === 2) {
    return `${fieldTitle} ${opLabel} ${filter.values[0]} ~ ${filter.values[1]}`;
  }
  return `${fieldTitle} ${opLabel} ${filter.values.join(', ')}`;
}

export function StaticFilterConfigZone({
  filters,
  onChange,
  availableFields = [],
  cubeViewName = null,
}: StaticFilterConfigZoneProps): React.JSX.Element {
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
    setDraft({ ...filters[index], values: [...filters[index].values] });
    setEditingIndex(index);
  };

  const saveDraft = () => {
    if (!draft || editingIndex === null) return;
    const staticDraft = { ...draft, isDynamic: false };
    if (editingIndex === -1) {
      onChange([...filters, staticDraft]);
    } else if (editingIndex >= 0 && editingIndex < filters.length) {
      onChange(filters.map((f, i) => (i === editingIndex ? staticDraft : f)));
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

  const distinctQueryTarget = useMemo(() => {
    if (!draft?.field?.trim() || !cubeViewName?.trim()) return null;
    return { viewName: cubeViewName.trim(), memberField: draft.field.trim() };
  }, [draft?.field, cubeViewName]);

  const valueIsTimeRangeDual =
    draft != null && isTimeType(draft.type || '') && isRangeOperator(draft.operator);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <div className="text-xs font-medium text-gray-400">静态过滤</div>
        <button
          onClick={openAdd}
          className="flex items-center gap-1 text-xs text-blue-500 hover:text-blue-600 transition-colors"
        >
          <PlusIcon className="size-3" />
          添加
        </button>
      </div>

      {filters.length === 0 && (
        <div className="text-xs text-gray-300 text-center py-2">无过滤条件</div>
      )}

      {filters.map((filter, idx) => (
        <div key={idx} className="flex items-center gap-1.5 bg-white border border-gray-200 rounded-md px-2.5 py-1.5 text-xs group">
          <MemberFieldTypeIcon type={filter.type || ''} />
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
          <div
            className="bg-white rounded-lg shadow-xl p-5 w-[min(100vw-2rem,42rem)] space-y-4"
            onClick={e => e.stopPropagation()}
          >
            <div className="text-sm font-semibold text-gray-700">
              {editingIndex === -1 ? '添加过滤条件' : '编辑过滤条件'}
            </div>

            <div className="shrink-0 space-y-2">
              <div className="text-xs font-semibold text-gray-700">条件配置</div>
              <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
                <div className="flex w-full max-w-[16rem] shrink-0 flex-col gap-1 sm:w-auto">
                  <label className="flex h-5 items-end text-xs leading-none text-gray-500">字段</label>
                  <div className="[&_button]:box-border [&_button]:h-8 [&_button]:py-0">
                    <Select
                      value={draft.field}
                      onChange={val => val && handleDraftFieldChange(val)}
                      options={availableFields.map(f => ({
                        value: f.name,
                        label: `${f.shortTitle || f.title || f.name} (${f.name})`,
                        icon: <MemberFieldTypeIcon type={f.type} />,
                      }))}
                      placeholder="选择字段"
                      size="sm"
                      portal
                      searchable
                      searchPlaceholder="搜索字段…"
                    />
                  </div>
                </div>

                <div className="flex w-[9.5rem] shrink-0 flex-col gap-1">
                  <label className="flex h-5 items-end text-xs leading-none text-gray-500">操作符</label>
                  <div className="[&_button]:box-border [&_button]:h-8 [&_button]:py-0">
                    <Select
                      value={draft.operator}
                      onChange={val => {
                        if (!val) return;
                        const nextOp = val as FilterOperator;
                        const clearsTimeRange = !isTimeType(draft.type || '') || !isRangeOperator(nextOp);
                        setDraft({
                          ...draft,
                          operator: nextOp,
                          values: isNoValueOperator(nextOp) ? [] : draft.values,
                          timeRelative: clearsTimeRange ? undefined : draft.timeRelative,
                          timeRange: clearsTimeRange ? undefined : draft.timeRange,
                        });
                      }}
                      options={getOperatorsForType(draft.type || 'string')}
                      placeholder="选择操作符"
                      size="sm"
                      portal
                    />
                  </div>
                </div>

                {!isNoValueOperator(draft.operator) && (
                  <div className="flex min-h-0 min-w-[14rem] flex-1 flex-col gap-1">
                    <label className="flex h-5 items-end text-xs leading-none text-gray-500">取值</label>
                    <FilterValueBar
                      hideTitle
                      showOperator={false}
                      fieldTitle=""
                      source={draft}
                      onPatch={patch => setDraft(prev => (prev ? { ...prev, ...patch } : prev))}
                      size="sm"
                      formRowCompact={!valueIsTimeRangeDual}
                      className={`max-w-none w-full ${!valueIsTimeRangeDual ? '[&_button]:box-border [&_button]:h-8 [&_button]:py-0' : ''}`}
                      distinctQueryTarget={distinctQueryTarget}
                      distinctSelectPortal
                      distinctShowSourceMeta
                      distinctSourceMetaMemberOnly
                    />
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="outline" onClick={cancelEdit}>
                取消
              </Button>
              <Button type="button" onClick={saveDraft}>
                确定
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
