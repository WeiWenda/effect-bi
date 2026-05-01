import { useEffect, useState, useMemo, useCallback } from 'react';
import { cubeProxyAPI } from '../../services/cubeProxyApi';
import type { CubeQuery, FilterOperator } from '../../types/chart';
import { Select } from '../ui/select';

const MULTI_VALUE_OPS: FilterOperator[] = ['in', 'notIn'];

function extractDistinctFromRows(rows: unknown[], memberField: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const shortKey = memberField.includes('.') ? memberField.split('.').pop() || memberField : memberField;
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const rec = row as Record<string, unknown>;
    const raw = rec[memberField] ?? rec[shortKey];
    if (raw == null || raw === '') continue;
    const s = String(raw);
    if (seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

export interface StringMemberDistinctPickerProps {
  viewName: string;
  memberField: string;
  operator: FilterOperator;
  values: string[];
  onValuesChange: (next: string[]) => void;
  size?: 'sm' | 'default';
  /** 在 Dialog 内使用时传 true，避免下拉被裁切 */
  selectPortal?: boolean;
  /** 与表单单行对齐：主控件与来源说明同一行，避免多出一行高度 */
  compactCaption?: boolean;
  /**
   * 图表动态筛选、看板筛选等场景：不展示「数据集 / view · 维度」与手动刷新（仍会自动拉 distinct）。
   */
  hideSourceAndRefresh?: boolean;
  /**
   * 与 hideSourceAndRefresh 互斥展示侧：为 true 时来源文案仅显示 memberField（view 仍写在 title 里）。
   * 用于看板筛选编辑弹窗等已在别处展示数据集的场景。
   */
  sourceMetaMemberOnly?: boolean;
  /** 单选模式下无选中时的占位（默认「从列表选择」） */
  selectPlaceholder?: string;
}

/**
 * 对绑定 Cube 成员发起仅含该 dimension 的 load（等价于 group by），结果用于 string 类型筛选取值。
 */
export function StringMemberDistinctPicker({
  viewName,
  memberField,
  operator,
  values,
  onValuesChange,
  size = 'default',
  selectPortal = false,
  compactCaption = false,
  hideSourceAndRefresh = false,
  sourceMetaMemberOnly = false,
  selectPlaceholder,
}: StringMemberDistinctPickerProps): React.JSX.Element {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<string[]>([]);
  const [multiListQuery, setMultiListQuery] = useState('');

  const loadDistinct = useCallback(async () => {
    if (!memberField.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const query: CubeQuery = {
        measures: [],
        dimensions: [memberField],
        timeDimensions: [],
        filters: [],
        order: [[memberField, 'asc']],
        limit: 2000,
      };
      const result = await cubeProxyAPI.load(query);
      const rows = result.data || [];
      setLoaded(extractDistinctFromRows(rows, memberField));
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        (e as Error)?.message ||
        '加载可选值失败';
      setError(msg);
      setLoaded([]);
    } finally {
      setLoading(false);
    }
  }, [memberField]);

  useEffect(() => {
    void loadDistinct();
  }, [loadDistinct, viewName]);

  useEffect(() => {
    setMultiListQuery('');
  }, [operator, memberField]);

  const isMulti = MULTI_VALUE_OPS.includes(operator);

  const selectOptions = useMemo(() => {
    const merged = new Map<string, string>();
    for (const v of values) {
      if (v) merged.set(v, v);
    }
    for (const v of loaded) merged.set(v, v);
    return [...merged.keys()].map(v => ({ value: v, label: v }));
  }, [loaded, values]);

  const multiFilteredOptions = useMemo(() => {
    const q = multiListQuery.trim().toLowerCase();
    if (!q) return selectOptions;
    return selectOptions.filter(o => o.value.toLowerCase().includes(q) || o.label.toLowerCase().includes(q));
  }, [selectOptions, multiListQuery]);

  const singleValue = values[0] ?? '';

  const isSm = size === 'sm';
  const textSize = isSm ? 'text-xs' : 'text-sm';
  const singleSelectPlaceholder = selectPlaceholder ?? '从列表选择';

  const showSource = !hideSourceAndRefresh;
  const sourceTitleFull = `${viewName} · ${memberField}`;
  const sourceLineText = sourceMetaMemberOnly ? memberField : sourceTitleFull;

  const metaAfterInput = showSource ? (
    <>
      <span
        className={`shrink-0 truncate text-gray-500 ${isSm ? 'max-w-[40%] text-[10px] leading-tight' : 'max-w-[45%] text-xs'}`}
        title={sourceTitleFull}
      >
        {sourceLineText}
      </span>
      {loading ? (
        <span className="shrink-0 text-gray-400 text-[10px] leading-none">加载中…</span>
      ) : (
        <button
          type="button"
          className="shrink-0 text-[10px] leading-none text-blue-500 hover:text-blue-600 sm:text-xs"
          onClick={() => void loadDistinct()}
        >
          刷新
        </button>
      )}
    </>
  ) : null;

  if (isMulti) {
    const toggle = (v: string, checked: boolean) => {
      if (checked) {
        if (!values.includes(v)) onValuesChange([...values, v]);
      } else {
        onValuesChange(values.filter(x => x !== v));
      }
    };

    const listScroll = (
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {selectOptions.length === 0 && !loading ? (
          <div className="px-2 py-2 text-gray-400">暂无可选值</div>
        ) : multiFilteredOptions.length === 0 ? (
          <div className="px-2 py-2 text-gray-400">无匹配项</div>
        ) : (
          multiFilteredOptions.map(opt => (
            <label
              key={opt.value}
              className="flex items-center gap-2 px-2 py-1 border-b border-gray-50 last:border-0 hover:bg-gray-50 cursor-pointer"
            >
              <input
                type="checkbox"
                className="rounded border-gray-300 shrink-0"
                checked={values.includes(opt.value)}
                onChange={e => toggle(opt.value, e.target.checked)}
              />
              <span className="truncate min-w-0">{opt.label}</span>
            </label>
          ))
        )}
      </div>
    );

    if (hideSourceAndRefresh) {
      return (
        <div className="space-y-1.5 min-w-0 w-full">
          {error ? <p className="text-xs text-red-500">{error}</p> : null}
          {error ? (
            <input
              type="text"
              value={values.join(', ')}
              onChange={e =>
                onValuesChange(
                  e.target.value
                    .split(',')
                    .map(v => v.trim())
                    .filter(Boolean)
                )
              }
              placeholder="查询失败时请手动输入；多个用英文逗号分隔"
              className={`w-full border border-gray-200 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-400 ${textSize}`}
            />
          ) : (
            <div
              className={`flex max-h-52 flex-col overflow-hidden rounded-md border border-gray-200 bg-white ${isSm ? 'text-xs' : 'text-sm'}`}
            >
              <input
                type="search"
                value={multiListQuery}
                onChange={e => setMultiListQuery(e.target.value)}
                placeholder="搜索可选值…"
                className={`shrink-0 border-0 border-b border-gray-200 px-2 py-1.5 outline-none focus:bg-gray-50 placeholder:text-gray-400 ${textSize}`}
                autoComplete="off"
              />
              {listScroll}
            </div>
          )}
        </div>
      );
    }

    const searchInputClass = `min-w-0 flex-1 rounded border border-gray-200 px-2 py-0.5 outline-none focus:border-blue-300 focus:ring-1 focus:ring-blue-200 placeholder:text-gray-400 ${textSize}`;

    if (compactCaption) {
      return (
        <div className="space-y-1.5 min-w-0 w-full">
          {!error ? (
            <div className={`flex min-w-0 items-center gap-2 text-gray-500 ${textSize}`}>
              <input
                type="search"
                value={multiListQuery}
                onChange={e => setMultiListQuery(e.target.value)}
                placeholder="搜索可选值…"
                className={searchInputClass}
                autoComplete="off"
              />
              {metaAfterInput}
            </div>
          ) : null}
          {error ? <p className="text-xs text-red-500">{error}</p> : null}
          {error ? (
            <input
              type="text"
              value={values.join(', ')}
              onChange={e =>
                onValuesChange(
                  e.target.value
                    .split(',')
                    .map(v => v.trim())
                    .filter(Boolean)
                )
              }
              placeholder="查询失败时请手动输入；多个用英文逗号分隔"
              className={`w-full border border-gray-200 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-400 ${textSize}`}
            />
          ) : (
            <div
              className={`flex max-h-52 flex-col overflow-hidden rounded-md border border-gray-200 bg-white ${isSm ? 'text-xs' : 'text-sm'}`}
            >
              {listScroll}
            </div>
          )}
        </div>
      );
    }

    return (
      <div className="space-y-1.5 min-w-0 w-full">
        {error ? <p className="text-xs text-red-500">{error}</p> : null}
        {error ? (
          <input
            type="text"
            value={values.join(', ')}
            onChange={e =>
              onValuesChange(
                e.target.value
                  .split(',')
                  .map(v => v.trim())
                  .filter(Boolean)
              )
            }
            placeholder="查询失败时请手动输入；多个用英文逗号分隔"
            className={`w-full border border-gray-200 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-400 ${textSize}`}
          />
        ) : (
          <div
            className={`flex max-h-52 flex-col overflow-hidden rounded-md border border-gray-200 bg-white ${isSm ? 'text-xs' : 'text-sm'}`}
          >
            <div className={`flex shrink-0 items-center gap-2 border-b border-gray-200 px-2 py-1.5 ${textSize}`}>
              <input
                type="search"
                value={multiListQuery}
                onChange={e => setMultiListQuery(e.target.value)}
                placeholder="搜索可选值…"
                className="min-w-0 flex-1 border-0 bg-transparent outline-none placeholder:text-gray-400 focus:bg-gray-50/50"
                autoComplete="off"
              />
              {metaAfterInput}
            </div>
            {listScroll}
          </div>
        )}
      </div>
    );
  }

  if (hideSourceAndRefresh) {
    return (
      <div className="flex min-w-0 w-full items-center">
        {error ? (
          <input
            type="text"
            value={values.join(', ')}
            onChange={e =>
              onValuesChange(
                e.target.value
                  .split(',')
                  .map(v => v.trim())
                  .filter(Boolean)
              )
            }
            placeholder="查询失败时请手动输入；多个用英文逗号分隔"
            title={error}
            aria-invalid
            className={`min-w-0 flex-1 border border-red-200 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-red-300 ${textSize}`}
          />
        ) : (
          <div className="min-w-0 flex-1">
            <Select
              value={singleValue}
              onChange={val => onValuesChange(val ? [val] : [])}
              options={selectOptions}
              placeholder={loading ? '加载中…' : singleSelectPlaceholder}
              size={isSm ? 'sm' : 'default'}
              disabled={loading}
              portal={selectPortal}
              searchable
              searchPlaceholder="搜索取值…"
            />
          </div>
        )}
      </div>
    );
  }

  if (compactCaption) {
    return (
      <div className="flex min-w-0 w-full items-center gap-2">
        {error ? (
          <input
            type="text"
            value={values.join(', ')}
            onChange={e =>
              onValuesChange(
                e.target.value
                  .split(',')
                  .map(v => v.trim())
                  .filter(Boolean)
              )
            }
            placeholder="查询失败时请手动输入；多个用英文逗号分隔"
            title={error}
            aria-invalid
            className={`min-w-0 flex-1 border border-red-200 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-red-300 ${textSize}`}
          />
        ) : (
          <>
            <div className="min-w-0 flex-1">
              <Select
                value={singleValue}
                onChange={val => onValuesChange(val ? [val] : [])}
                options={selectOptions}
                placeholder={loading ? '加载中…' : singleSelectPlaceholder}
                size={isSm ? 'sm' : 'default'}
                disabled={loading}
                portal={selectPortal}
                searchable
                searchPlaceholder="搜索取值…"
              />
            </div>
            {metaAfterInput}
          </>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-1 min-w-0 w-full">
      {error ? <p className="text-xs text-red-500">{error}</p> : null}
      {error ? (
        <input
          type="text"
          value={values.join(', ')}
          onChange={e =>
            onValuesChange(
              e.target.value
                .split(',')
                .map(v => v.trim())
                .filter(Boolean)
            )
          }
          placeholder="查询失败时请手动输入；多个用英文逗号分隔"
          className={`w-full border border-gray-200 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-400 ${textSize}`}
        />
      ) : (
        <>
          <Select
            value={singleValue}
            onChange={val => onValuesChange(val ? [val] : [])}
            options={selectOptions}
            placeholder={loading ? '加载中…' : singleSelectPlaceholder}
            size={isSm ? 'sm' : 'default'}
            disabled={loading}
            portal={selectPortal}
            searchable
            searchPlaceholder="搜索取值…"
          />
          <div className={`flex min-w-0 items-center gap-2 text-gray-500 ${textSize}`}>
            <span className="min-w-0 flex-1 truncate" title={sourceTitleFull}>
              {sourceLineText}
            </span>
            {loading ? (
              <span className="shrink-0 text-gray-400">加载中…</span>
            ) : (
              <button
                type="button"
                className="shrink-0 text-blue-500 hover:text-blue-600"
                onClick={() => void loadDistinct()}
              >
                刷新
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
