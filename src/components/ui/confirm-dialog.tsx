import { useState } from 'react';
import { AlertTriangleIcon, XIcon } from 'lucide-react';

interface ConfirmDialogProps {
  open: boolean;
  title?: string;
  description: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title = '确认',
  description,
  confirmText = '确定',
  cancelText = '取消',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[9998] flex items-center justify-center">
      <div className="fixed inset-0 bg-black/40" onClick={onCancel} />
      <div className="relative z-10 w-full max-w-sm rounded-xl bg-white p-6 shadow-xl animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-start gap-3">
          <AlertTriangleIcon className="size-5 shrink-0 text-amber-500 mt-0.5" />
          <div className="flex-1">
            <h3 className="font-semibold text-gray-900">{title}</h3>
            <p className="mt-1 text-sm text-gray-500">{description}</p>
          </div>
          <button onClick={onCancel} className="shrink-0 text-gray-400 hover:text-gray-600">
            <XIcon className="size-4" />
          </button>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded-lg border border-gray-200 px-4 py-1.5 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            className="rounded-lg bg-red-500 px-4 py-1.5 text-sm text-white hover:bg-red-600 transition-colors"
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}

export function useConfirmDialog() {
  const [state, setState] = useState<{
    open: boolean;
    description: string;
    onConfirm: () => void;
  }>({ open: false, description: '', onConfirm: () => {} });

  const confirm = (description: string): Promise<void> => {
    return new Promise((resolve) => {
      setState({
        open: true,
        description,
        onConfirm: () => {
          setState(prev => ({ ...prev, open: false }));
          resolve();
        },
      });
    });
  };

  const cancel = () => {
    setState(prev => ({ ...prev, open: false }));
  };

  return { ...state, confirm, cancel };
}
