import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { Button } from '../ui/button';
import type { EtlTaskTypePersisted } from '../../utils/etlWorkspaceStorage';

export interface EtlNewTaskConfirmPayload {
  etlTaskType: EtlTaskTypePersisted;
  taskName: string;
}

interface EtlNewTaskDialogProps {
  open: boolean;
  folderHint: string;
  onClose: () => void;
  /** 成功时由父组件关闭弹窗；失败时请 throw 以便保留弹窗 */
  onConfirm: (payload: EtlNewTaskConfirmPayload) => Promise<void>;
}

const TYPE_OPTIONS: { value: EtlTaskTypePersisted; label: string; disabled?: boolean }[] = [
  { value: 'data_import', label: '数据导入（暂不实现）', disabled: true },
  { value: 'data_export', label: '数据导出（暂不实现）', disabled: true },
  { value: 'hsql', label: 'HSQL' },
];

export function EtlNewTaskDialog({ open, folderHint, onClose, onConfirm }: EtlNewTaskDialogProps): JSX.Element {
  const [etlTaskType, setEtlTaskType] = useState<EtlTaskTypePersisted>('hsql');
  const [taskName, setTaskName] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setEtlTaskType('hsql');
      setTaskName('');
    }
  }, [open]);

  const submit = async () => {
    const name = taskName.trim();
    if (!name) return;
    if (etlTaskType !== 'hsql') return;
    setSubmitting(true);
    try {
      await onConfirm({ etlTaskType, taskName: name });
    } catch {
      /* 父组件已 toast；保持弹窗 */
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>新增 ETL</DialogTitle>
          <p className="text-xs text-gray-500 mt-1">{folderHint}</p>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <span className="block text-sm font-medium text-gray-700 mb-2">任务类型</span>
            <div className="space-y-2">
              {TYPE_OPTIONS.map(opt => (
                <label
                  key={opt.value}
                  className={`flex items-center gap-2 text-sm ${opt.disabled ? 'text-gray-400 cursor-not-allowed' : 'text-gray-800 cursor-pointer'}`}
                >
                  <input
                    type="radio"
                    name="etl-new-task-type"
                    value={opt.value}
                    checked={etlTaskType === opt.value}
                    disabled={opt.disabled}
                    onChange={() => {
                      if (!opt.disabled) setEtlTaskType(opt.value);
                    }}
                  />
                  {opt.label}
                </label>
              ))}
            </div>
          </div>
          <div>
            <label htmlFor="etl-new-task-name" className="block text-sm font-medium text-gray-700 mb-1">
              任务名称
            </label>
            <input
              id="etl-new-task-name"
              type="text"
              value={taskName}
              onChange={e => setTaskName(e.target.value)}
              placeholder="逻辑任务名，如 my_daily_etl"
              className="w-full text-sm border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500"
              onKeyDown={e => {
                if (e.key === 'Enter') submit();
              }}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" type="button" onClick={onClose}>
            取消
          </Button>
          <Button
            type="button"
            onClick={() => void submit()}
            disabled={!taskName.trim() || etlTaskType !== 'hsql' || submitting}
          >
            {submitting ? '创建中…' : '确认'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
