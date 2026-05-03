import { XIcon, DatabaseIcon, TerminalIcon } from 'lucide-react';

export type EtlNewTabChoice = 'ddl-placeholder' | 'adhoc';

interface EtlNewTabPickerProps {
  open: boolean;
  onClose: () => void;
  onChoose: (choice: EtlNewTabChoice) => void;
}

const cards: { choice: EtlNewTabChoice; title: string; desc: string; icon: typeof DatabaseIcon; disabled?: boolean }[] = [
  {
    choice: 'ddl-placeholder',
    title: '建表',
    desc: '通过可视化或 DDL 管理表结构（即将上线）',
    icon: DatabaseIcon,
    disabled: true,
  },
  {
    choice: 'adhoc',
    title: 'Ad-hoc 查询',
    desc: '元数据树 + SQL 调试与历史回溯',
    icon: TerminalIcon,
  },
];

export function EtlNewTabPicker({ open, onClose, onChoose }: EtlNewTabPickerProps): React.JSX.Element | null {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full border border-gray-200">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-800">新建标签页</h2>
          <button type="button" onClick={onClose} className="p-1 rounded-md hover:bg-gray-100 text-gray-500">
            <XIcon className="size-4" />
          </button>
        </div>
        <div className="p-4 grid gap-3">
          {cards.map(({ choice, title, desc, icon: Icon, disabled }) => (
            <button
              key={choice}
              type="button"
              disabled={disabled}
              onClick={() => {
                if (disabled) return;
                onChoose(choice);
                onClose();
              }}
              className={`flex gap-3 text-left rounded-lg border p-3 transition-colors ${
                disabled
                  ? 'border-gray-100 bg-gray-50 text-gray-400 cursor-not-allowed'
                  : 'border-gray-200 hover:border-blue-300 hover:bg-blue-50/40 cursor-pointer'
              }`}
            >
              <span className={`shrink-0 p-2 rounded-md ${disabled ? 'bg-gray-100' : 'bg-blue-100 text-blue-700'}`}>
                <Icon className="size-5" />
              </span>
              <span>
                <span className="block text-sm font-medium text-gray-900">{title}</span>
                <span className="block text-xs text-gray-500 mt-0.5">{desc}</span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
