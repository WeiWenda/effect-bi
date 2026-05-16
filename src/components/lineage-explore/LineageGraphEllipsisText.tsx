import { useEffect, useRef, useState } from 'react';
import { Check, Copy } from 'lucide-react';

interface LineageGraphEllipsisTextProps {
  text: string;
  className?: string;
  /** 展示行数：1 为单行省略，2 为两行省略 */
  lines?: 1 | 2;
  copyable?: boolean;
}

/** 血缘图节点内文本：宽度内省略，hover 浮层展示全文（与 Table Meta 一致） */
export function LineageGraphEllipsisText({
  text,
  className = 'text-sm text-gray-800',
  lines = 1,
  copyable = false,
}: LineageGraphEllipsisTextProps): React.JSX.Element {
  const leaveTimer = useRef<ReturnType<typeof setTimeout>>();
  const [tipOpen, setTipOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(
    () => () => {
      if (leaveTimer.current) clearTimeout(leaveTimer.current);
    },
    []
  );

  const openTip = () => {
    if (leaveTimer.current) clearTimeout(leaveTimer.current);
    setTipOpen(true);
  };

  const scheduleClose = () => {
    leaveTimer.current = setTimeout(() => setTipOpen(false), 120);
  };

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  const clampClass = lines === 2 ? 'line-clamp-2' : 'truncate';

  return (
    <div
      className="relative mb-1 w-full min-w-0"
      onMouseEnter={openTip}
      onMouseLeave={scheduleClose}
    >
      <div className={`${clampClass} ${className}`}>{text}</div>
      {tipOpen && (
        <div
          role="tooltip"
          className="nodrag nopan nowheel absolute left-0 top-full z-[1000] mt-1 w-max max-w-[min(320px,90vw)] rounded-md border border-gray-200 bg-white px-2.5 py-2 shadow-lg"
          onMouseEnter={openTip}
          onMouseLeave={scheduleClose}
          onPointerDown={e => e.stopPropagation()}
        >
          <div className="flex items-start gap-2">
            <span className="break-all text-sm text-gray-800">{text}</span>
            {copyable && (
              <button
                type="button"
                onClick={handleCopy}
                className="nodrag shrink-0 rounded p-1 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
                title={copied ? '已复制' : '复制'}
              >
                {copied ? <Check className="size-3.5 text-green-600" /> : <Copy className="size-3.5" />}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}