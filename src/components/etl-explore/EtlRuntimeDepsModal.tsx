import { useEffect, useMemo, useState } from 'react';
import { Button } from '../ui/button';
import {
  emptyRuntimeDependencyRow,
  parseRuntimeDepsFromJsonText,
  runtimeDepsToJsonText,
  type EtlRuntimeDependencyRow,
} from '../../utils/etlRuntimeDeps';
import { GravitinoTripleSelect } from './GravitinoTripleSelect';
import { gravitinoAPI, gravitinoTableHasSecondaryPartition } from '../../services/gravitinoApi';
import { PlusIcon, Trash2Icon, XIcon } from 'lucide-react';

interface EtlRuntimeDepsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  runtimeDepsJsonText: string;
  onSave: (nextRuntimeDepsJsonText: string) => void;
}

/**
 * 与查询侧「添加过滤条件」(StaticFilterConfigZone) 相同策略：
 * fixed 全屏遮罩 + 居中白卡片，不用 Radix Dialog；Select 仅 `portal` → document.body，
 * 下拉浮在卡片之上且不被 overflow 裁切。
 */
export function EtlRuntimeDepsModal({
  open,
  onOpenChange,
  runtimeDepsJsonText,
  onSave,
}: EtlRuntimeDepsModalProps): React.JSX.Element | null {
  const [rows, setRows] = useState<EtlRuntimeDependencyRow[]>([]);
  const [secondaryFieldMeta, setSecondaryFieldMeta] = useState<
    Record<number, { loading: boolean; allowSecondary: boolean }>
  >({});

  const tripleDepsKey = useMemo(
    () => JSON.stringify(rows.map(r => [r.catalog.trim(), r.database.trim(), r.table.trim()])),
    [rows]
  );

  useEffect(() => {
    if (!open) return;
    const parsed = parseRuntimeDepsFromJsonText(runtimeDepsJsonText);
    const normalized =
      parsed.length > 0
        ? parsed.map(r => ({
            ...r,
            partition: r.partition.trim() || '-1 day',
          }))
        : [emptyRuntimeDependencyRow()];
    setRows(normalized);
  }, [open, runtimeDepsJsonText]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    rows.forEach((row, index) => {
      const c = row.catalog.trim();
      const d = row.database.trim();
      const t = row.table.trim();
      if (!c || !d || !t) {
        setSecondaryFieldMeta(m => ({ ...m, [index]: { loading: false, allowSecondary: false } }));
        return;
      }
      setSecondaryFieldMeta(m => ({ ...m, [index]: { loading: true, allowSecondary: false } }));
      void gravitinoAPI
        .getTableDetail(c, d, t)
        .then(res => {
          if (cancelled) return;
          const allow = gravitinoTableHasSecondaryPartition(res.table);
          setSecondaryFieldMeta(m => ({ ...m, [index]: { loading: false, allowSecondary: allow } }));
          if (!allow) {
            setRows(prev => {
              const cur = prev[index];
              if (!cur?.secondaryPartitions.trim()) return prev;
              return prev.map((r, i) => (i === index ? { ...r, secondaryPartitions: '' } : r));
            });
          }
        })
        .catch(() => {
          if (cancelled) return;
          setSecondaryFieldMeta(m => ({ ...m, [index]: { loading: false, allowSecondary: false } }));
        });
    });
    return () => {
      cancelled = true;
    };
  }, [open, tripleDepsKey]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onOpenChange(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onOpenChange]);

  const updateRow = (index: number, partial: Partial<EtlRuntimeDependencyRow>) => {
    setRows(prev => prev.map((row, i) => (i === index ? { ...row, ...partial } : row)));
  };

  const addRow = () => {
    setRows(prev => [...prev, emptyRuntimeDependencyRow()]);
  };

  const removeRow = (index: number) => {
    setRows(prev => (prev.length <= 1 ? [emptyRuntimeDependencyRow()] : prev.filter((_, i) => i !== index)));
  };

  const handleSave = () => {
    const text = runtimeDepsToJsonText(rows);
    onSave(text);
    onOpenChange(false);
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
      role="presentation"
      onClick={() => onOpenChange(false)}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="etl-runtime-deps-title"
        className="flex max-h-[min(88vh,calc(100vh-2rem))] w-[min(100vw-2rem,80rem)] flex-col overflow-hidden rounded-lg border border-gray-200 bg-white shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-gray-100 px-5 pt-5 pb-3 sm:px-6">
          <div className="min-w-0 space-y-1">
            <h2 id="etl-runtime-deps-title" className="text-lg font-semibold leading-none text-gray-900">
              配置运行依赖
            </h2>
            <p className="text-xs text-gray-500">
              Catalog / Database / Table 三层；持久化为 JSON 字段 catalog、database、table。
            </p>
          </div>
          <button
            type="button"
            className="rounded-md p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
            aria-label="关闭"
            onClick={() => onOpenChange(false)}
          >
            <XIcon className="size-5" />
          </button>
        </div>

        <div className="relative z-0 flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-5 py-3 sm:px-6">
          <div className="overflow-x-auto rounded-md border border-gray-200">
            <table className="w-full border-collapse text-[11px]">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-left text-gray-600">
                  <th className="px-2 py-1.5 font-medium min-w-[120px]">Catalog</th>
                  <th className="px-2 py-1.5 font-medium min-w-[120px]">Database</th>
                  <th className="px-2 py-1.5 font-medium min-w-[120px]">Table</th>
                  <th className="px-2 py-1.5 font-medium min-w-[120px]">分区</th>
                  <th className="px-2 py-1.5 font-medium min-w-[140px]">二级分区</th>
                  <th className="px-2 py-1.5 font-medium w-14 text-center">操作</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr key={index} className="border-b border-gray-100 align-top">
                    <GravitinoTripleSelect
                      variant="tableCells"
                      enabled={open}
                      portal
                      value={{ catalog: row.catalog, database: row.database, table: row.table }}
                      onChange={t =>
                        updateRow(index, {
                          catalog: t.catalog,
                          database: t.database,
                          table: t.table,
                        })
                      }
                    />
                    <td className="p-1">
                      <input
                        className="w-full rounded border border-gray-200 px-1.5 py-1 font-mono"
                        value={row.partition}
                        onChange={e => updateRow(index, { partition: e.target.value })}
                        placeholder="-1 day"
                      />
                    </td>
                    <td className="p-1">
                      <input
                        className="w-full rounded border border-gray-200 px-1.5 py-1 font-mono disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-400"
                        value={row.secondaryPartitions}
                        onChange={e => updateRow(index, { secondaryPartitions: e.target.value })}
                        placeholder="a,b,c"
                        disabled={
                          secondaryFieldMeta[index]?.loading !== false ||
                          secondaryFieldMeta[index]?.allowSecondary !== true
                        }
                        title={
                          secondaryFieldMeta[index]?.loading
                            ? '正在读取表分区信息…'
                            : secondaryFieldMeta[index]?.allowSecondary === true
                              ? '多级分区表：填写二级分区值'
                              : '当前表在 Gravitino 中只有一级分区或未分区，无需填写二级分区'
                        }
                      />
                    </td>
                    <td className="p-1 text-center">
                      <button
                        type="button"
                        className="inline-flex rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-red-600"
                        title="删除本行"
                        onClick={() => removeRow(index)}
                      >
                        <Trash2Icon className="size-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="shrink-0">
            <button
              type="button"
              onClick={addRow}
              className="inline-flex w-fit max-w-full items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800"
            >
              <PlusIcon className="size-3.5 shrink-0" />
              添加一行
            </button>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-gray-100 px-5 py-4 sm:px-6">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button type="button" onClick={handleSave}>
            保存
          </Button>
        </div>
      </div>
    </div>
  );
}
