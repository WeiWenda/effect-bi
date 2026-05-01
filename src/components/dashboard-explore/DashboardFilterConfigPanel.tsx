import { useState, useCallback } from 'react';
import { PlusIcon, XIcon, PencilIcon, LayoutGridIcon } from 'lucide-react';
import type { ChartConfig, DashboardLayoutItem, FilterConfig } from '../../types/chart';
import {
  getAffectedChartIdsForDashboardFilter,
  resolveDistinctQueryTarget,
} from '../../utils/dashboardFilterBindings';
import { DashboardFilterEditModal, emptyFilterTemplate } from './DashboardFilterEditModal';
import { FilterValueBar } from '../filter/FilterValueBar';

export interface DashboardFilterConfigPanelProps {
  filters: FilterConfig[];
  onChange: (filters: FilterConfig[]) => void;
  charts: ChartConfig[];
  /** 用于展示图表所在标签组 / 标签 */
  layout: DashboardLayoutItem[];
  mode: 'edit' | 'preview';
  /** 悬停「关联图表」图标时传入受影响的 chart id，离开时传空数组 */
  onHighlightCharts?: (chartIds: number[]) => void;
}

export function DashboardFilterConfigPanel({
  filters,
  onChange,
  charts,
  layout,
  mode,
  onHighlightCharts,
}: DashboardFilterConfigPanelProps): React.JSX.Element {
  const [modalOpen, setModalOpen] = useState(false);
  const [modalDraft, setModalDraft] = useState<FilterConfig | null>(null);
  const [modalIsNew, setModalIsNew] = useState(false);
  const [modalIndex, setModalIndex] = useState<number | null>(null);

  const openAdd = useCallback(() => {
    setModalDraft(emptyFilterTemplate(charts));
    setModalIsNew(true);
    setModalIndex(-1);
    setModalOpen(true);
  }, [charts]);

  const openEdit = useCallback((index: number) => {
    const f = filters[index];
    setModalDraft({
      ...f,
      values: [...f.values],
      timeRelative: f.timeRelative ? { ...f.timeRelative } : undefined,
      timeRange: f.timeRange
        ? { start: { ...f.timeRange.start }, end: { ...f.timeRange.end } }
        : undefined,
    });
    setModalIsNew(false);
    setModalIndex(index);
    setModalOpen(true);
  }, [filters]);

  const removeFilter = (index: number) => {
    onChange(filters.filter((_, i) => i !== index));
  };

  const handleModalSave = useCallback(
    (next: FilterConfig) => {
      if (modalIndex === -1) {
        onChange([...filters, next]);
      } else if (modalIndex !== null && modalIndex >= 0) {
        onChange(filters.map((f, i) => (i === modalIndex ? next : f)));
      }
      setModalDraft(null);
      setModalIndex(null);
    },
    [filters, modalIndex, onChange]
  );

  const hoverIds = useCallback(
    (filter: FilterConfig) => {
      onHighlightCharts?.(getAffectedChartIdsForDashboardFilter(filter, charts));
    },
    [charts, onHighlightCharts]
  );

  const clearHover = useCallback(() => {
    onHighlightCharts?.([]);
  }, [onHighlightCharts]);

  return (
    <div className="space-y-1.5">
      {mode === 'edit' && (
        <div className="dashboard-filter-add-bar flex items-center gap-2 p-2 bg-white rounded border border-dashed border-purple-200 shrink-0">
          <button
            type="button"
            onClick={openAdd}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-purple-600 text-white rounded-md hover:bg-purple-700 transition-colors"
          >
            <PlusIcon className="size-3.5" />
            添加筛选条件
          </button>
          <span className="text-xs text-gray-500 hidden sm:inline">在弹窗中配置关联图表、维度与取值</span>
        </div>
      )}

      {filters.length === 0 && (
        <div className="text-xs text-gray-300 text-center py-2">无过滤条件</div>
      )}

      {filters.map((filter, idx) => (
        <div
          key={idx}
          className="flex items-center gap-1.5 bg-white border border-gray-200 rounded-md px-2.5 py-1.5 text-xs group"
        >
          <span
            className="shrink-0 inline-flex p-0.5 rounded hover:bg-blue-50 text-blue-500 cursor-default"
            title="悬停查看该条件影响的图表"
            onMouseEnter={() => hoverIds(filter)}
            onMouseLeave={clearHover}
          >
            <LayoutGridIcon className="size-3.5" aria-hidden />
          </span>
          <FilterValueBar
            className="flex-1 min-w-0 border-blue-100"
            fieldTitle={filter.displayName?.trim() || filter.shortTitle || filter.title || filter.field || '筛选条件'}
            source={{
              operator: filter.operator,
              values: filter.values,
              type: filter.type,
              timeRelative: filter.timeRelative,
              timeRange: filter.timeRange,
            }}
            onPatch={patch => {
              onChange(filters.map((f, i) => (i === idx ? { ...f, ...patch } : f)));
            }}
            size="sm"
            distinctQueryTarget={resolveDistinctQueryTarget(filter, charts)}
            distinctSelectPortal
          />
          {mode === 'edit' && (
            <div className="flex flex-col gap-0.5 shrink-0">
              <button
                type="button"
                onClick={() => openEdit(idx)}
                className="text-gray-300 hover:text-blue-500 transition-colors"
                title="编辑绑定与操作符"
              >
                <PencilIcon className="size-3" />
              </button>
              <button
                type="button"
                onClick={() => removeFilter(idx)}
                className="text-gray-300 hover:text-red-500 transition-colors"
                title="删除"
              >
                <XIcon className="size-3" />
              </button>
            </div>
          )}
        </div>
      ))}

      <DashboardFilterEditModal
        open={modalOpen}
        onOpenChange={open => {
          setModalOpen(open);
          if (!open) {
            setModalDraft(null);
            setModalIndex(null);
          }
        }}
        charts={charts}
        layout={layout}
        draft={modalDraft}
        isNew={modalIsNew}
        onSave={handleModalSave}
      />
    </div>
  );
}
