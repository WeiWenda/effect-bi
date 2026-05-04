import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Button } from '../ui/button';
import {
  emptyRuntimeDependencyRow,
  parseRuntimeDepsFromJsonText,
  runtimeDepsToJsonText,
  type EtlRuntimeDependencyRow,
} from '../../utils/etlRuntimeDeps';
import { GravitinoTripleSelect } from './GravitinoTripleSelect';
import { PlusIcon, Trash2Icon } from 'lucide-react';

interface EtlRuntimeDepsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  runtimeDepsJsonText: string;
  onSave: (nextRuntimeDepsJsonText: string) => void;
}

export function EtlRuntimeDepsModal({
  open,
  onOpenChange,
  runtimeDepsJsonText,
  onSave,
}: EtlRuntimeDepsModalProps): React.JSX.Element {
  const [rows, setRows] = useState<EtlRuntimeDependencyRow[]>([]);

  useEffect(() => {
    if (!open) return;
    const parsed = parseRuntimeDepsFromJsonText(runtimeDepsJsonText);
    setRows(parsed.length > 0 ? parsed : [emptyRuntimeDependencyRow()]);
  }, [open, runtimeDepsJsonText]);

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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-5xl max-h-[88vh] overflow-y-auto gap-3"
        showCloseButton
      >
        <DialogHeader>
          <DialogTitle>配置运行依赖</DialogTitle>
          <p className="text-xs text-muted-foreground">
            Catalog / Database / Table 三层；持久化为 JSON 字段 catalog、database、table。
          </p>
        </DialogHeader>

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
                      className="w-full rounded border border-gray-200 px-1.5 py-1 font-mono"
                      value={row.secondaryPartitions}
                      onChange={e => updateRow(index, { secondaryPartitions: e.target.value })}
                      placeholder="a,b,c"
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

        <div className="justify-self-start">
          <button
            type="button"
            onClick={addRow}
            className="inline-flex w-fit max-w-full items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800"
          >
            <PlusIcon className="size-3.5 shrink-0" />
            添加一行
          </button>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button type="button" onClick={handleSave}>
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
