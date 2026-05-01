import { useMemo } from 'react';
import { XIcon } from 'lucide-react';
import { TimeRangeDualControl } from './TimeRangeDualControl';
import { StringMemberDistinctPicker } from './StringMemberDistinctPicker';
import type { FilterConfig, FilterOperator } from '../../types/chart';
import { isDashboardStringFilterType } from '../../utils/dashboardFilterBindings';
import {
  defaultEmptyTimeRange,
  expandTimeRangeSpecForQuery,
  isTimeRangeSpecComplete,
  migrateLegacyToTimeRange,
} from '../../utils/filterTimeRelative';
import { isNoValueOperator, isNumberType, isRangeOperator, isTimeType } from '../../utils/filterOperatorUi';

const ALL_OPERATORS: { value: FilterOperator; label: string }[] = [
  { value: 'equals', label: '等于' },
  { value: 'notEquals', label: '不等于' },
  { value: 'contains', label: '包含' },
  { value: 'notContains', label: '不包含' },
  { value: 'in', label: '在列表中' },
  { value: 'notIn', label: '不在列表中' },
  { value: 'gt', label: '大于' },
  { value: 'gte', label: '大于等于' },
  { value: 'lt', label: '小于' },
  { value: 'lte', label: '小于等于' },
  { value: 'inDateRange', label: '在范围内' },
  { value: 'notInDateRange', label: '不在范围内' },
  { value: 'set', label: '有值' },
  { value: 'notSet', label: '无值' },
];

function getOperatorLabel(op: FilterOperator): string {
  return ALL_OPERATORS.find(o => o.value === op)?.label || op;
}

/**
 * 取值区：占满父级剩余空间，最小宽度不随输入内容收缩（避免空值时控件过窄）；
 * 内容过长时在区内 min-w-0 截断/滚动。
 */
const VALUE_AREA_WRAP_CLASS =
  'flex min-h-0 w-full min-w-[14rem] flex-1 basis-0 max-w-full';

export type FilterValueSource = Pick<FilterConfig, 'operator' | 'values' | 'type' | 'timeRelative' | 'timeRange'>;

export interface FilterValueBarProps {
  fieldTitle: string;
  hideTitle?: boolean;
  showOperator?: boolean;
  source: FilterValueSource;
  onPatch: (patch: Partial<Pick<FilterConfig, 'values' | 'timeRelative' | 'timeRange'>>) => void;
  size?: 'sm' | 'default';
  className?: string;
  onRemove?: () => void;
  allowRelativePersist?: boolean;
  /** 若提供且类型为 string-like，则对 member 发起 Cube distinct 查询并以下拉/多选展示取值 */
  distinctQueryTarget?: { viewName: string; memberField: string } | null;
  /** 在 Dialog 内为 string 下拉传 true */
  distinctSelectPortal?: boolean;
  /** 与表单单行对齐：收紧内边距，distinct 下拉使用单行数据集说明 */
  formRowCompact?: boolean;
  /**
   * 为 true 时：distinct 下拉展示「view · 维度」与刷新（如图表编辑弹窗内配置取值）。
   * 默认 false：图表动态筛选、看板筛选列表行等仍隐藏来源与刷新。
   */
  distinctShowSourceMeta?: boolean;
  /** 与 distinctShowSourceMeta 同用时：来源行只显示维度字段，view 仅在悬停 title 中（如看板筛选弹窗上方表格已含数据集列） */
  distinctSourceMetaMemberOnly?: boolean;
  /**
   * 无取值时的占位（空取值不参与 Cube 查询）。
   * 用于文本输入框与 string distinct 单选下拉。
   */
  emptyValuePlaceholder?: string;
}

/**
 * 与图表动态过滤条一致：白底蓝框一行展示「标题 · 操作符 · 取值控件」
 */
export function FilterValueBar({
  fieldTitle,
  hideTitle = false,
  showOperator = true,
  source,
  onPatch,
  size = 'default',
  className = '',
  onRemove,
  allowRelativePersist = true,
  distinctQueryTarget = null,
  distinctSelectPortal = false,
  formRowCompact = false,
  distinctShowSourceMeta = false,
  distinctSourceMetaMemberOnly = false,
  emptyValuePlaceholder = '任意值',
}: FilterValueBarProps): React.JSX.Element {
  const isSm = size === 'sm';
  const textSize = isSm ? 'text-xs' : 'text-sm';
  const isTimeRange = isTimeType(source.type || '') && isRangeOperator(source.operator);
  const persistRelative = allowRelativePersist !== false;
  const useDistinctPicker =
    Boolean(distinctQueryTarget) &&
    isDashboardStringFilterType(source.type || '') &&
    !isTimeRange;

  const timeSpec = useMemo(
    () => migrateLegacyToTimeRange(source as FilterConfig) ?? defaultEmptyTimeRange(),
    [
      source.operator,
      source.timeRange,
      source.timeRelative,
      Array.isArray(source.values) ? source.values.join('\0') : '',
    ]
  );

  const padCompact = formRowCompact && isSm;

  return (
    <div
      className={`bg-white border border-blue-200 rounded-md px-3 py-1 flex-1 min-w-0 max-w-full ${isSm && !padCompact ? 'py-1 px-2' : ''} ${padCompact ? 'px-2 py-0' : ''} ${className}`}
    >
      <div
        className={`flex w-full gap-2 ${formRowCompact && !isTimeRange ? 'min-h-8 items-center flex-nowrap' : 'items-center flex-wrap'} ${isSm ? 'gap-1.5' : ''}`}
      >
        {!hideTitle && (
          <span className={`text-gray-600 font-medium shrink-0 ${textSize}`}>{fieldTitle}</span>
        )}
        {showOperator && (
          <span className={`text-gray-400 shrink-0 ${textSize}`}>{getOperatorLabel(source.operator)}</span>
        )}

        {!isNoValueOperator(source.operator) && (
          <div className={VALUE_AREA_WRAP_CLASS}>
            {isTimeRange ? (
              <div className="min-w-0 w-full">
                <TimeRangeDualControl
                  value={timeSpec}
                  onChange={next => {
                    if (!persistRelative) {
                      if (!isTimeRangeSpecComplete(next)) return;
                      const [a, b] = expandTimeRangeSpecForQuery(next, new Date());
                      onPatch({ values: [a, b], timeRange: undefined, timeRelative: undefined });
                    } else {
                      onPatch({ timeRange: next, values: [], timeRelative: undefined });
                    }
                  }}
                  size={isSm ? 'sm' : 'default'}
                />
              </div>
            ) : useDistinctPicker && distinctQueryTarget ? (
              <StringMemberDistinctPicker
                viewName={distinctQueryTarget.viewName}
                memberField={distinctQueryTarget.memberField}
                operator={source.operator}
                values={(source.values || []).map(v => (v == null ? '' : String(v)))}
                onValuesChange={next => onPatch({ values: next })}
                size={isSm ? 'sm' : 'default'}
                selectPortal={distinctSelectPortal}
                compactCaption={formRowCompact}
                hideSourceAndRefresh={!distinctShowSourceMeta}
                sourceMetaMemberOnly={distinctSourceMetaMemberOnly}
                selectPlaceholder={emptyValuePlaceholder}
              />
            ) : (
              <input
                type={isNumberType(source.type || '') ? 'number' : 'text'}
                value={(source.values || []).join(', ')}
                onChange={e =>
                  onPatch({
                    values: e.target.value
                      .split(',')
                      .map(v => v.trim())
                      .filter(Boolean),
                  })
                }
                placeholder={emptyValuePlaceholder}
                title="多个值用英文逗号分隔"
                className={`w-full min-w-0 border border-gray-200 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-400 ${textSize} ${formRowCompact && isSm ? 'h-8 box-border' : ''}`}
              />
            )}
          </div>
        )}

        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="text-gray-300 hover:text-red-500 transition-colors shrink-0 ml-auto"
          >
            <XIcon className="size-3" />
          </button>
        )}
      </div>
    </div>
  );
}
