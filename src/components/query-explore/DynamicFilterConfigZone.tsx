import { useState, useMemo } from 'react';
import { XIcon, PencilIcon, PlusIcon } from 'lucide-react';
import { Select } from '../ui/select';
import { FilterValueBar } from '../filter/FilterValueBar';
import { MemberFieldTypeIcon } from '../filter/MemberFieldTypeIcon';
import { Button } from '@/components/ui/button';
import type { DynamicFilterConfig, FilterOperator } from '../../types/chart';
import {
  getOperatorLabel,
  getOperatorsForType,
  isNoValueOperator,
  isRangeOperator,
  isTimeType,
} from '../../utils/filterOperatorUi';

export interface DynamicFilterConfigZoneProps {
  dynamicFilters: DynamicFilterConfig[];
  onDynamicFiltersChange: (filters: DynamicFilterConfig[]) => void;
  availableFields: { name: string; title: string; shortTitle?: string; type: string }[];
  /** 当前 Cube 数据集名；用于 string 类型成员 distinct 默认值 */
  cubeViewName?: string | null;
}

export function DynamicFilterConfigZone({
  dynamicFilters,
  onDynamicFiltersChange,
  availableFields,
  cubeViewName = null,
}: DynamicFilterConfigZoneProps): React.JSX.Element {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [draft, setDraft] = useState<DynamicFilterConfig | null>(null);
  const [displayNameError, setDisplayNameError] = useState('');

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
      displayName: '',
    });
    setDisplayNameError('');
    setEditingIndex(-1);
  };

  const handleOpenEdit = (index: number) => {
    setDraft({ ...dynamicFilters[index], defaultValues: [...(dynamicFilters[index].defaultValues || [])] });
    setDisplayNameError('');
    setEditingIndex(index);
  };

  const handleSave = () => {
    if (!draft || editingIndex === null) return;
    const label = draft.displayName?.trim() ?? '';
    if (!label) {
      setDisplayNameError('请输入显示名称');
      return;
    }
    setDisplayNameError('');
    const toSave = { ...draft, displayName: label };
    if (editingIndex === -1) {
      onDynamicFiltersChange([...dynamicFilters, toSave]);
    } else {
      onDynamicFiltersChange(dynamicFilters.map((f, i) => (i === editingIndex ? toSave : f)));
    }
    setEditingIndex(null);
    setDraft(null);
  };

  const handleCancel = () => {
    setEditingIndex(null);
    setDraft(null);
    setDisplayNameError('');
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

  const distinctQueryTarget = useMemo(() => {
    if (!draft?.field?.trim() || !cubeViewName?.trim()) return null;
    return { viewName: cubeViewName.trim(), memberField: draft.field.trim() };
  }, [draft?.field, cubeViewName]);

  const valueIsTimeRangeDual =
    draft != null && isTimeType(draft.type || '') && isRangeOperator(draft.operator);

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
          <MemberFieldTypeIcon type={filter.type || ''} />
          <span className="flex-1 text-blue-700 truncate">
            {(filter.displayName?.trim() || filter.shortTitle || filter.title || filter.field) +
              ' ' +
              getOperatorLabel(filter.operator)}
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
          <div
            className="bg-white rounded-lg shadow-xl p-5 w-[min(100vw-2rem,42rem)] space-y-4"
            onClick={e => e.stopPropagation()}
          >
            <div className="text-sm font-semibold text-gray-700">
              {editingIndex === -1 ? '添加动态过滤器' : '编辑动态过滤器'}
            </div>

            <div className="shrink-0 space-y-2">
              <div className="text-xs font-semibold text-gray-700">条件配置</div>
              <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
                <div className="flex w-full max-w-[16rem] shrink-0 flex-col gap-1 sm:w-auto">
                  <label className="flex h-5 items-end text-xs leading-none text-gray-500">字段</label>
                  <div className="[&_button]:box-border [&_button]:h-8 [&_button]:py-0">
                    <Select
                      value={draft.field}
                      onChange={val => val && handleFieldChange(val)}
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
                        setDraft({
                          ...draft,
                          operator: nextOp,
                          defaultValues: isNoValueOperator(nextOp) ? undefined : [],
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
                      source={{
                        operator: draft.operator,
                        values: draft.defaultValues ?? [],
                        type: draft.type,
                      }}
                      onPatch={patch =>
                        setDraft(prev => {
                          if (!prev) return prev;
                          const nextVals = patch.values !== undefined ? patch.values : prev.defaultValues ?? [];
                          return {
                            ...prev,
                            defaultValues: nextVals.length > 0 ? nextVals : undefined,
                          };
                        })
                      }
                      size="sm"
                      formRowCompact={!valueIsTimeRangeDual}
                      allowRelativePersist={false}
                      className={`max-w-none w-full ${!valueIsTimeRangeDual ? '[&_button]:box-border [&_button]:h-8 [&_button]:py-0' : ''}`}
                      distinctQueryTarget={distinctQueryTarget}
                      distinctSelectPortal
                      distinctShowSourceMeta
                      distinctSourceMetaMemberOnly
                    />
                  </div>
                )}

                <div className="flex w-full max-w-[16rem] shrink-0 flex-col gap-1 sm:w-auto">
                  <label className="flex h-5 items-end text-xs leading-none text-gray-500">
                    显示名称 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={draft.displayName ?? ''}
                    onChange={e => {
                      setDraft({ ...draft, displayName: e.target.value });
                      if (displayNameError) setDisplayNameError('');
                    }}
                    placeholder="过滤条展示名"
                    className={`box-border h-8 w-full rounded-md border px-2 text-xs focus:outline-none focus:ring-1 ${
                      displayNameError ? 'border-red-400 focus:ring-red-400' : 'border-gray-300 focus:ring-blue-400'
                    }`}
                  />
                  {displayNameError ? <p className="text-xs text-red-500">{displayNameError}</p> : null}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="outline" onClick={handleCancel}>
                取消
              </Button>
              <Button type="button" onClick={handleSave}>
                确定
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
