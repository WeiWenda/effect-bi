import { useState, useEffect, useMemo, useCallback, type ReactNode } from 'react';
import { TypeIcon } from 'lucide-react';
import { Select } from '../ui/select';
import { FilterValueBar } from '../filter/FilterValueBar';
import { MemberFieldTypeIcon } from '../filter/MemberFieldTypeIcon';
import type { ChartConfig, CubeMeta, DashboardLayoutItem, FilterConfig, FilterOperator } from '../../types/chart';
import { resolveDistinctQueryTarget } from '../../utils/dashboardFilterBindings';
import { buildChartTabPlacementMap } from '../../utils/dashboardTabOnlyLayout';
import { cubeProxyAPI } from '../../services/cubeProxyApi';
import { migrateLegacyToTimeRange } from '../../utils/filterTimeRelative';
import {
  getOperatorsForType,
  isNoValueOperator,
  isRangeOperator,
  isTimeType,
} from '../../utils/filterOperatorUi';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface BindingRow {
  enabled: boolean;
  field: string;
}

function pickDefaultFieldForChart(
  c: ChartConfig,
  filter: FilterConfig,
  metaByView: Record<string, CubeMeta>
): string {
  const dimNames = (metaByView[c.viewName]?.dimensions ?? []).map(d => d.name).filter(Boolean);
  const f = filter.field?.trim();
  if (f && dimNames.includes(f)) return f;
  const opts = dimensionOptionsFromMeta(c.viewName, metaByView, '');
  return opts[0]?.value ?? '';
}

/**
 * 已保存的 chartBindings（非空）：按绑定还原。
 * chartBindings 为 []：显式不对任何图生效，全部不勾选。
 * 未定义 chartBindings（新建或旧数据）：默认全部图表关联，维度优先用 filter.field（若在该数据集 meta 中），否则该数据集首项维度。
 */
function initBindingRows(
  filter: FilterConfig,
  charts: ChartConfig[],
  metaByView: Record<string, CubeMeta>
): Record<number, BindingRow> {
  const rows: Record<number, BindingRow> = {};
  const bindings = filter.chartBindings;

  for (const c of charts) {
    if (c.id == null) continue;

    if (bindings !== undefined && bindings.length > 0) {
      const hit = bindings.find(b => b.chartId === c.id && b.field?.trim());
      rows[c.id] = hit ? { enabled: true, field: hit.field.trim() } : { enabled: false, field: '' };
      continue;
    }

    if (bindings !== undefined && bindings.length === 0) {
      rows[c.id] = { enabled: false, field: '' };
      continue;
    }

    const opts = dimensionOptionsFromMeta(c.viewName, metaByView, '');
    if (!c.viewName?.trim() || opts.length === 0) {
      rows[c.id] = { enabled: false, field: '' };
      continue;
    }
    const field = pickDefaultFieldForChart(c, filter, metaByView);
    rows[c.id] = { enabled: true, field };
  }
  return rows;
}

function dimensionOptionsFromMeta(
  viewName: string,
  metaByView: Record<string, CubeMeta>,
  currentField: string
): { value: string; label: string; icon: ReactNode }[] {
  const cube = viewName?.trim() ? metaByView[viewName.trim()] : undefined;
  const list = cube?.dimensions ?? [];
  const seen = new Set<string>();
  const out: { value: string; label: string; icon: ReactNode }[] = [];
  for (const d of list) {
    const name = d.name?.trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    const t = d.type || '';
    const icon = <MemberFieldTypeIcon type={t} />;
    out.push({
      value: name,
      label: `${d.shortTitle || d.title || name} (${name})`,
      icon,
    });
  }
  const cur = currentField?.trim();
  if (cur && !seen.has(cur)) {
    out.unshift({
      value: cur,
      label: `${cur}（已保存，当前元数据无此项）`,
      icon: <TypeIcon className="size-3 text-amber-500" />,
    });
  }
  return out;
}

export function emptyFilterTemplate(_charts?: ChartConfig[]): FilterConfig {
  return {
    field: '',
    title: undefined,
    type: 'string',
    operator: 'equals',
    values: [],
    isDynamic: false,
    displayName: '',
  };
}

export interface DashboardFilterEditModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  charts: ChartConfig[];
  /** 看板主列布局，用于解析图表所在标签组 / 标签 */
  layout: DashboardLayoutItem[];
  draft: FilterConfig | null;
  isNew: boolean;
  onSave: (next: FilterConfig) => void;
}

export function DashboardFilterEditModal({
  open,
  onOpenChange,
  charts,
  layout,
  draft,
  isNew,
  onSave,
}: DashboardFilterEditModalProps): React.JSX.Element | null {
  const [local, setLocal] = useState<FilterConfig | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [nameError, setNameError] = useState('');
  const [rows, setRows] = useState<Record<number, BindingRow>>({});
  const [metaByView, setMetaByView] = useState<Record<string, CubeMeta>>({});
  const [metaLoading, setMetaLoading] = useState(false);
  const [metaError, setMetaError] = useState<string | null>(null);

  const chartTabPlacementMap = useMemo(() => buildChartTabPlacementMap(layout), [layout]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setMetaLoading(true);
    setMetaError(null);
    cubeProxyAPI
      .meta()
      .then(res => {
        if (cancelled) return;
        const next: Record<string, CubeMeta> = {};
        for (const cube of res.cubes || []) {
          if (cube?.name) next[cube.name] = cube;
        }
        setMetaByView(next);
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          const msg =
            (e as { response?: { data?: { error?: string } } })?.response?.data?.error ||
            (e as Error)?.message ||
            '加载 Cube 元数据失败';
          setMetaError(msg);
          setMetaByView({});
        }
      })
      .finally(() => {
        if (!cancelled) setMetaLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  /** draft 切换：同步表单主体与显示名（不因 meta 刷新而重置显示名） */
  useEffect(() => {
    if (!open || !draft) return;
    setLocal({
      ...draft,
      values: [...draft.values],
      timeRelative: draft.timeRelative ? { ...draft.timeRelative } : undefined,
      timeRange: draft.timeRange
        ? {
            start: { ...draft.timeRange.start },
            end: { ...draft.timeRange.end },
          }
        : migrateLegacyToTimeRange(draft) ?? undefined,
    });
    setDisplayName(draft.displayName ?? '');
    setNameError('');
  }, [open, draft, charts]);

  /** meta / draft 变化：默认全部关联图表行，并在 filter.field 为空时用首图首维同步顶层 field */
  useEffect(() => {
    if (!open || !draft) return;
    const newRows = initBindingRows(draft, charts, metaByView);
    setRows(newRows);
    setLocal(prev => {
      if (!prev) return prev;
      if (draft.field?.trim()) return prev;
      for (const c of charts) {
        if (c.id == null) continue;
        const r = newRows[c.id];
        if (r?.enabled && r.field?.trim()) {
          const dm = metaByView[c.viewName]?.dimensions.find(d => d.name === r.field);
          return {
            ...prev,
            field: r.field,
            title: dm?.title || dm?.shortTitle,
            type: dm?.type || 'string',
          };
        }
      }
      return prev;
    });
  }, [open, draft, charts, metaByView]);

  const resolveMemberMeta = useCallback(
    (viewName: string, memberName: string): { field: string; title?: string; type: string } | null => {
      const cube = viewName?.trim() ? metaByView[viewName.trim()] : undefined;
      const d = cube?.dimensions.find(x => x.name === memberName);
      if (d) return { field: d.name, title: d.title || d.shortTitle, type: d.type || 'string' };
      return null;
    },
    [metaByView]
  );

  const firstBoundMeta = useMemo(() => {
    if (!local) return null as { field: string; title?: string; type: string } | null;
    for (const c of charts) {
      if (c.id == null) continue;
      const r = rows[c.id];
      if (!r?.enabled || !r.field) continue;
      const fromMeta = resolveMemberMeta(c.viewName, r.field);
      if (fromMeta) return fromMeta;
      const dim = c.dimensions.find(d => d.field === r.field);
      if (dim) return { field: dim.field, title: dim.title, type: dim.type || 'string' };
      const met = c.metrics.find(m => m.field === r.field);
      if (met) return { field: met.field, title: met.title, type: met.type || 'number' };
    }
    return null;
  }, [charts, rows, local, resolveMemberMeta]);

  /** 元数据就绪后，对已勾选但未选维度的行自动选第一项 */
  useEffect(() => {
    if (!open || metaLoading) return;
    setRows(prev => {
      let changed = false;
      const next = { ...prev };
      for (const c of charts) {
        if (c.id == null || !c.viewName?.trim()) continue;
        const r = next[c.id];
        if (!r?.enabled || r.field?.trim()) continue;
        const opts = dimensionOptionsFromMeta(c.viewName, metaByView, '');
        if (opts.length > 0) {
          next[c.id] = { enabled: true, field: opts[0].value };
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [open, metaLoading, metaByView, charts]);

  const effectiveType = firstBoundMeta?.type || local?.type || 'string';

  const distinctQueryTarget = useMemo(() => {
    if (!local) return null;
    const syntheticBindings = Object.entries(rows)
      .filter(([, r]) => r.enabled && r.field?.trim())
      .map(([id, r]) => ({ chartId: Number(id), field: r.field.trim() }));
    const synthetic: FilterConfig = {
      ...local,
      type: effectiveType,
      field: firstBoundMeta?.field ?? local.field,
      chartBindings: syntheticBindings,
    };
    return resolveDistinctQueryTarget(synthetic, charts);
  }, [local, effectiveType, rows, charts, firstBoundMeta]);

  const handleToggle = (chartId: number, enabled: boolean) => {
    setRows(prev => {
      const c = charts.find(x => x.id === chartId);
      const next = { ...prev, [chartId]: { ...prev[chartId], enabled } };
      if (enabled && c && !next[chartId].field?.trim()) {
        const opts = dimensionOptionsFromMeta(c.viewName, metaByView, '');
        if (opts.length > 0) {
          next[chartId] = { enabled: true, field: opts[0].value };
        }
      }
      return next;
    });
  };

  const handleFieldChange = (chartId: number, field: string) => {
    setRows(prev => ({ ...prev, [chartId]: { ...prev[chartId], enabled: true, field } }));
  };

  const handleSave = () => {
    if (!local) return;
    const name = displayName.trim();
    if (!name) {
      setNameError('请输入显示名称');
      return;
    }
    setNameError('');
    const chartBindings = Object.entries(rows)
      .filter(([, r]) => r.enabled && r.field?.trim())
      .map(([id, r]) => ({ chartId: Number(id), field: r.field }));

    const meta = firstBoundMeta;
    const op = local.operator;
    const isTr = isTimeType(effectiveType) && isRangeOperator(op);
    const next: FilterConfig = {
      ...local,
      field: meta?.field ?? local.field,
      title: meta?.title ?? local.title,
      type: meta?.type ?? local.type,
      chartBindings,
      displayName: name,
      timeRange: isTr ? local.timeRange ?? migrateLegacyToTimeRange(local) ?? undefined : undefined,
      timeRelative: undefined,
      values: isTr ? [] : local.values,
      isDynamic: false,
    };
    onSave(next);
    onOpenChange(false);
  };

  const valueIsTimeRangeDual =
    local != null && isTimeType(effectiveType) && isRangeOperator(local.operator);

  if (!local) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange} modal={false}>
      <DialogContent className="max-w-6xl max-h-[min(90vh,860px)] w-[min(100vw-2rem,72rem)] flex flex-col gap-0 p-0 overflow-hidden sm:max-w-6xl">
        <DialogHeader className="px-6 pt-6 pb-2 shrink-0 border-b border-gray-100">
          <DialogTitle>{isNew ? '添加看板筛选条件' : '编辑看板筛选条件'}</DialogTitle>
        </DialogHeader>

        <div className="flex-1 min-h-0 flex flex-col gap-4 overflow-hidden px-6 py-4">
          <div className="shrink-0 space-y-2">
            <div className="text-xs font-semibold text-gray-700">条件配置</div>
            <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
              <div className="flex w-full max-w-[16rem] shrink-0 flex-col gap-1 sm:w-auto">
                <label className="flex h-5 items-end text-xs leading-none text-gray-500">
                  显示名称 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={displayName}
                  onChange={e => {
                    setDisplayName(e.target.value);
                    if (nameError) setNameError('');
                  }}
                  placeholder="列表展示名"
                  className={`box-border h-8 w-full rounded-md border px-2 text-xs focus:outline-none focus:ring-1 ${
                    nameError ? 'border-red-400 focus:ring-red-400' : 'border-gray-300 focus:ring-blue-400'
                  }`}
                />
                {nameError ? <p className="text-xs text-red-500">{nameError}</p> : null}
              </div>
              <div className="flex w-[9.5rem] shrink-0 flex-col gap-1">
                <label className="flex h-5 items-end text-xs leading-none text-gray-500">操作符</label>
                <div className="[&_button]:box-border [&_button]:h-8 [&_button]:py-0">
                  <Select
                    value={local.operator}
                    onChange={val => {
                      const nextOp = val as FilterOperator;
                      const clearsTimeRange = !isTimeType(effectiveType) || !isRangeOperator(nextOp);
                      setLocal({
                        ...local,
                        operator: nextOp,
                        values: isNoValueOperator(nextOp) ? [] : local.values,
                        timeRelative: clearsTimeRange ? undefined : local.timeRelative,
                        timeRange: clearsTimeRange ? undefined : local.timeRange,
                      });
                    }}
                    options={getOperatorsForType(effectiveType)}
                    placeholder="选择操作符"
                    size="sm"
                    portal
                  />
                </div>
              </div>
              {!isNoValueOperator(local.operator) && (
                <div className="flex min-h-0 min-w-[14rem] flex-1 flex-col gap-1">
                  <label className="flex h-5 items-end text-xs leading-none text-gray-500">取值</label>
                  <FilterValueBar
                    hideTitle
                    showOperator={false}
                    fieldTitle=""
                    source={local}
                    onPatch={patch => setLocal({ ...local, ...patch })}
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

          <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
            <div className="text-xs font-semibold text-gray-700">关联图表及维度</div>
            <p className="text-[10px] text-gray-500 leading-snug">
              打开弹窗即请求 Cube meta。默认已关联全部有维度的图表（可取消勾选）；已保存过绑定条件的将按记录还原。维度列表为各图表数据集在
              meta 中的全部维度，不含指标。
            </p>
            {metaError ? <p className="text-xs text-red-500">{metaError}</p> : null}
            {metaLoading ? <p className="text-xs text-gray-400">正在加载数据集维度…</p> : null}
            <div className="min-h-0 flex-1 overflow-auto rounded-md border border-gray-200">
              <table className="w-full min-w-[52rem] table-auto text-xs">
                <thead className="sticky top-0 z-[1] bg-gray-50 text-gray-600">
                  <tr>
                    <th className="w-8 px-2 py-1.5 text-left font-medium"> </th>
                    <th className="min-w-[7rem] px-2 py-1.5 text-left font-medium">图表</th>
                    <th className="min-w-[9rem] px-2 py-1.5 text-left font-medium">标签组 · 标签</th>
                    <th className="min-w-[6rem] px-2 py-1.5 text-left font-medium">数据集</th>
                    <th className="min-w-[16rem] px-2 py-1.5 text-left font-medium">维度</th>
                  </tr>
                </thead>
                <tbody>
                  {charts.map(c => {
                    if (c.id == null) return null;
                    const row = rows[c.id] ?? { enabled: false, field: '' };
                    const dimOpts = dimensionOptionsFromMeta(c.viewName, metaByView, row.field);
                    const noView = !c.viewName?.trim();
                    const noDim = !metaLoading && (noView || dimOpts.length === 0);
                    const tabPlacement = c.id != null ? chartTabPlacementMap.get(c.id) : undefined;
                    return (
                      <tr key={c.id} className="border-t border-gray-100 align-middle">
                        <td className="px-2 py-1.5">
                          <input
                            type="checkbox"
                            checked={row.enabled}
                            disabled={metaLoading || noDim}
                            onChange={e => handleToggle(c.id!, e.target.checked)}
                            className="rounded border-gray-300"
                          />
                        </td>
                        <td className="px-2 py-1.5 text-gray-800">
                          <span className="line-clamp-2 break-words" title={c.name}>
                            {c.name}
                          </span>
                        </td>
                        <td className="px-2 py-1.5 text-gray-600">
                          <span className="line-clamp-2 break-words" title={tabPlacement || '未出现在标签组内'}>
                            {tabPlacement ?? '—'}
                          </span>
                        </td>
                        <td className="px-2 py-1.5 text-gray-600">
                          <span className="line-clamp-2 break-words font-mono text-[11px]" title={c.viewName}>
                            {c.viewName}
                          </span>
                        </td>
                        <td className="px-2 py-1.5 align-middle">
                          {metaLoading ? (
                            <span className="text-gray-400">…</span>
                          ) : noView ? (
                            <span className="text-gray-400">无数据集</span>
                          ) : noDim ? (
                            <span className="text-gray-400">无维度</span>
                          ) : (
                            <Select
                              value={row.field}
                              onChange={val => handleFieldChange(c.id!, val)}
                              options={dimOpts}
                              placeholder="选择维度"
                              size="sm"
                              disabled={!row.enabled}
                              portal
                              searchable
                              searchPlaceholder="搜索维度…"
                            />
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <DialogFooter className="px-6 py-4 border-t border-gray-100 shrink-0 gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button type="button" onClick={handleSave}>
            确定
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
