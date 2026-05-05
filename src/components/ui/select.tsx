import { useState, useRef, useLayoutEffect, useMemo, useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDownIcon } from 'lucide-react';

export interface SelectOption {
  value: string;
  label: string;
  icon?: ReactNode;
}

interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  size?: 'default' | 'sm';
  /** 为 true 时将下拉渲染到 portal 根节点，避免 Dialog transform 导致定位错位 */
  portal?: boolean;
  /**
   * 与 `portal` 一起使用：将下拉挂到此 DOM 节点（须在 Dialog 内容区内）。
   * 不传则挂到 `document.body`。Dialog 内搜索框需传入，否则 Radix 焦点陷阱无法聚焦输入框。
   */
  portalContainer?: HTMLElement | null;
  /** 为 true 时显示搜索框并过滤选项（长列表推荐） */
  searchable?: boolean;
  searchPlaceholder?: string;
}

export function Select({
  value,
  onChange,
  options,
  placeholder = '请选择',
  className = '',
  disabled = false,
  size = 'default',
  portal = false,
  portalContainer = null,
  searchable = false,
  searchPlaceholder = '搜索…',
}: SelectProps): React.JSX.Element {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [portalLayout, setPortalLayout] = useState({ top: 0, left: 0, width: 200, maxH: 280 });

  const isSm = size === 'sm';

  useEffect(() => {
    if (!isOpen) setSearchQuery('');
  }, [isOpen]);

  const filteredOptions = useMemo(() => {
    if (!searchable || !searchQuery.trim()) return options;
    const q = searchQuery.trim().toLowerCase();
    return options.filter(
      o => o.value.toLowerCase().includes(q) || o.label.toLowerCase().includes(q)
    );
  }, [options, searchQuery, searchable]);

  useLayoutEffect(() => {
    if (!isOpen || !portal || !buttonRef.current) return;
    const r = buttonRef.current.getBoundingClientRect();
    const w = Math.max(r.width, 120);
    let left: number;
    let top: number;
    let spaceBelow: number;

    if (portalContainer) {
      const cr = portalContainer.getBoundingClientRect();
      left = Math.min(Math.max(4, r.left - cr.left), Math.max(4, cr.width - w - 4));
      top = r.bottom - cr.top + 4;
      // 按视口剩余高度算，避免弹窗内按钮贴底时 spaceBelow 过小导致列表几乎不可见
      spaceBelow = window.innerHeight - r.bottom - 16;
    } else {
      left = Math.min(r.left, window.innerWidth - w - 8);
      top = r.bottom + 4;
      spaceBelow = window.innerHeight - r.bottom - 14;
    }

    const maxH = Math.max(120, Math.min(360, Math.max(0, spaceBelow)));
    setPortalLayout({ top, left, width: w, maxH });
  }, [isOpen, portal, portalContainer, options.length, searchable, searchQuery]);

  const selectedOption = options.find(opt => opt.value === value);

  const searchInputCls = isSm
    ? 'shrink-0 w-full border-0 border-b border-gray-200 px-2 py-1.5 text-xs outline-none focus:bg-gray-50 placeholder:text-gray-400'
    : 'shrink-0 w-full border-0 border-b border-gray-200 px-3 py-2 text-sm outline-none focus:bg-gray-50 placeholder:text-gray-400';

  const renderOptionButtons = () => (
    <>
      {filteredOptions.length === 0 ? (
        <div className={`${isSm ? 'px-2 py-1.5' : 'px-3 py-2'} text-sm text-gray-400`}>
          {searchable && searchQuery.trim() ? '无匹配项' : '无选项'}
        </div>
      ) : (
        filteredOptions.map(option => (
          <button
            key={option.value}
            type="button"
            onClick={() => {
              onChange(option.value);
              setIsOpen(false);
            }}
            className={`w-full text-left transition-colors shrink-0 ${
              isSm ? 'px-2 py-1 text-xs' : 'px-3 py-2 text-sm'
            } ${
              value === option.value
                ? 'bg-blue-50 text-blue-700 font-medium'
                : 'text-gray-700 hover:bg-gray-50'
            }`}
          >
            <div className="flex items-center gap-1.5 min-w-0">
              {option.icon}
              <span className="truncate">{option.label}</span>
            </div>
          </button>
        ))
      )}
    </>
  );

  const dropdownShellCls = `flex min-h-0 flex-col overflow-hidden rounded-md border border-gray-200 bg-white shadow-lg ${
    isSm ? 'text-xs' : ''
  }`;

  /** 与 searchInputCls 的垂直 padding 一致，用于非 portal 下 calc 列表最大高度 */
  const searchChromePx = searchable ? (isSm ? 34 : 44) : 0;

  return (
    <div className={`relative ${className}`}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={`w-full flex items-center justify-between border rounded-md transition-colors ${
          isSm
            ? `px-1.5 py-0.5 text-xs gap-0.5 ${disabled ? 'bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed' : isOpen ? 'bg-white border-blue-400 ring-1 ring-blue-400' : 'bg-white border-gray-300 text-gray-700 hover:border-gray-400'}`
            : `px-3 py-2 text-sm ${disabled ? 'bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed' : isOpen ? 'bg-white border-blue-400 ring-1 ring-blue-400' : 'bg-white border-gray-300 text-gray-700 hover:border-gray-400'}`
        }`}
      >
        <span className={`flex items-center gap-1.5 min-w-0 ${selectedOption ? 'text-gray-700' : 'text-gray-400'}`}>
          {selectedOption?.icon}
          <span className="truncate">{selectedOption?.label || placeholder}</span>
        </span>
        <ChevronDownIcon className={`${isSm ? 'size-3' : 'size-4'} text-gray-400 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && !disabled && (
        <>
          {/* Dialog 内 portal 时由 portal 内遮罩关闭，避免 fixed 遮罩盖住下拉 */}
          {!(portal && portalContainer) ? (
            <div className="fixed inset-0 z-[140]" aria-hidden onClick={() => setIsOpen(false)} />
          ) : null}
          {portal && typeof document !== 'undefined'
            ? createPortal(
                <>
                  {portalContainer ? (
                    <div
                      className="pointer-events-auto absolute inset-0 z-[140]"
                      aria-hidden
                      onClick={() => setIsOpen(false)}
                    />
                  ) : null}
                  <div
                    className={`${portalContainer ? 'absolute' : 'fixed'} z-[150] pointer-events-auto ${dropdownShellCls}`}
                    style={{
                      top: portalLayout.top,
                      left: portalLayout.left,
                      width: portalLayout.width,
                      height: portalLayout.maxH,
                      maxHeight: portalLayout.maxH,
                    }}
                    onClick={e => e.stopPropagation()}
                  >
                    {searchable ? (
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        placeholder={searchPlaceholder}
                        className={searchInputCls}
                        autoComplete="off"
                        onKeyDown={e => e.stopPropagation()}
                      />
                    ) : null}
                    <div
                      className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
                      onWheel={e => e.stopPropagation()}
                    >
                      {renderOptionButtons()}
                    </div>
                  </div>
                </>,
                portalContainer ?? document.body
              )
            : (
                <div
                  className={`absolute left-0 right-0 top-full z-[150] mt-1 flex min-h-0 max-h-60 min-w-full flex-col overflow-hidden ${dropdownShellCls}`}
                  onClick={e => e.stopPropagation()}
                  style={searchable ? { maxHeight: '15rem' } : undefined}
                >
                  {searchable ? (
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      placeholder={searchPlaceholder}
                      className={searchInputCls}
                      autoComplete="off"
                      onKeyDown={e => e.stopPropagation()}
                    />
                  ) : null}
                  <div
                    className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
                    style={searchable ? { maxHeight: `calc(15rem - ${searchChromePx}px)` } : undefined}
                    onWheel={e => e.stopPropagation()}
                  >
                    {renderOptionButtons()}
                  </div>
                </div>
              )}
        </>
      )}
    </div>
  );
}
