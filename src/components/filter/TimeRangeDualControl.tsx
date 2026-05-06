import { useState, useEffect, useRef, useLayoutEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import type { TimeRangeSpec, TimeRelativeUnit } from '../../types/chart';
import {
  TIME_RELATIVE_UNITS,
  formatDateYMD,
  formatTimeBoundDisplay,
  parseYmdToLocalDate,
} from '../../utils/filterTimeRelative';

type PanelTab = 'preset' | 'relative' | 'absolute';

function cloneSpec(s: TimeRangeSpec): TimeRangeSpec {
  return {
    start: { ...s.start },
    end: { ...s.end },
  };
}

function buildPresets(): { label: string; getSpec: () => TimeRangeSpec }[] {
  return [
    {
      label: '昨日',
      getSpec: () => ({
        start: { kind: 'relative', relativeAmount: 1, relativeUnit: 'days' },
        end: { kind: 'relative', relativeAmount: 1, relativeUnit: 'days' },
      }),
    },
    {
      label: '近7天',
      getSpec: () => ({
        start: { kind: 'relative', relativeAmount: 7, relativeUnit: 'days' },
        end: { kind: 'relative', relativeAmount: 0, relativeUnit: 'days' },
      }),
    },
    {
      label: '近14天',
      getSpec: () => ({
        start: { kind: 'relative', relativeAmount: 14, relativeUnit: 'days' },
        end: { kind: 'relative', relativeAmount: 0, relativeUnit: 'days' },
      }),
    },
    {
      label: '近30天',
      getSpec: () => ({
        start: { kind: 'relative', relativeAmount: 30, relativeUnit: 'days' },
        end: { kind: 'relative', relativeAmount: 0, relativeUnit: 'days' },
      }),
    },
    {
      label: '近90天',
      getSpec: () => ({
        start: { kind: 'relative', relativeAmount: 90, relativeUnit: 'days' },
        end: { kind: 'relative', relativeAmount: 0, relativeUnit: 'days' },
      }),
    },
    {
      label: '本月',
      getSpec: () => {
        const n = new Date();
        const start = new Date(n.getFullYear(), n.getMonth(), 1);
        return {
          start: { kind: 'absolute', date: formatDateYMD(start) },
          end: { kind: 'absolute', date: formatDateYMD(n) },
        };
      },
    },
    {
      label: '上月',
      getSpec: () => {
        const n = new Date();
        const start = new Date(n.getFullYear(), n.getMonth() - 1, 1);
        const end = new Date(n.getFullYear(), n.getMonth(), 0);
        return {
          start: { kind: 'absolute', date: formatDateYMD(start) },
          end: { kind: 'absolute', date: formatDateYMD(end) },
        };
      },
    },
    {
      label: '本年',
      getSpec: () => {
        const n = new Date();
        const start = new Date(n.getFullYear(), 0, 1);
        return {
          start: { kind: 'absolute', date: formatDateYMD(start) },
          end: { kind: 'absolute', date: formatDateYMD(n) },
        };
      },
    },
  ];
}

export interface TimeRangeDualControlProps {
  value: TimeRangeSpec;
  onChange: (next: TimeRangeSpec) => void;
  size?: 'sm' | 'default';
  disabled?: boolean;
}

export function TimeRangeDualControl({
  value,
  onChange,
  size = 'default',
  disabled = false,
}: TimeRangeDualControlProps): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [side, setSide] = useState<'start' | 'end'>('start');
  const [tab, setTab] = useState<PanelTab>('preset');
  const [work, setWork] = useState<TimeRangeSpec>(() => cloneSpec(value));
  const [panelPos, setPanelPos] = useState({ top: 0, left: 0, width: 320 });
  const [relAmt, setRelAmt] = useState(7);
  const [relUnit, setRelUnit] = useState<TimeRelativeUnit>('days');
  const startRef = useRef<HTMLButtonElement>(null);
  const endRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const isSm = size === 'sm';
  const textCls = isSm ? 'text-xs' : 'text-sm';
  const padCls = isSm ? 'px-2 py-1' : 'px-2.5 py-1.5';

  useEffect(() => {
    if (!open) {
      setWork(cloneSpec(value));
    }
  }, [open, value]);

  const anchorRef = side === 'start' ? startRef : endRef;

  useLayoutEffect(() => {
    if (!open || !anchorRef.current) return;
    const r = anchorRef.current.getBoundingClientRect();
    const w = Math.max(300, 280);
    setPanelPos({
      top: r.bottom + 6,
      left: Math.min(Math.max(8, r.left), window.innerWidth - w - 8),
      width: w,
    });
  }, [open, side, tab]);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (panelRef.current?.contains(t)) return;
      if (startRef.current?.contains(t)) return;
      if (endRef.current?.contains(t)) return;
      close();
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open, close]);

  const openFor = (s: 'start' | 'end') => {
    setSide(s);
    setTab('preset');
    setWork(cloneSpec(value));
    setOpen(true);
  };

  const commit = (next: TimeRangeSpec) => {
    setWork(next);
    onChange(next);
  };

  useEffect(() => {
    const b = work[side];
    if (b.kind === 'relative') {
      setRelAmt(b.relativeAmount ?? 0);
      setRelUnit(b.relativeUnit ?? 'days');
    }
  }, [side, open, work]);

  const applyRelativeToSide = () => {
    const next = cloneSpec(work);
    next[side] = { kind: 'relative', relativeAmount: relAmt, relativeUnit: relUnit };
    commit(next);
  };

  const applyAbsoluteDate = (d: Date | null) => {
    if (!d) return;
    const next = cloneSpec(work);
    next[side] = { kind: 'absolute', date: formatDateYMD(d) };
    commit(next);
  };

  const presets = buildPresets();

  const triggerCls = `flex flex-1 min-w-0 items-center gap-1.5 border border-gray-200 rounded-md bg-white ${padCls} ${textCls} text-left hover:border-blue-300 focus:outline-none focus:ring-1 focus:ring-blue-400 disabled:opacity-50 disabled:cursor-not-allowed`;

  const panel = open && !disabled && (
    <div
      ref={panelRef}
      className="rounded-lg border border-gray-200 bg-white shadow-xl p-3 space-y-3"
      style={{
        position: 'fixed',
        top: panelPos.top,
        left: panelPos.left,
        width: panelPos.width,
        zIndex: 200,
      }}
    >
      <div className="text-xs font-medium text-gray-600">
        {side === 'start' ? '开始时间' : '结束时间'}
      </div>
      <div className="flex border-b border-gray-200">
        {(['preset', 'relative', 'absolute'] as PanelTab[]).map(k => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={`flex-1 px-2 py-1.5 text-xs font-medium transition-colors ${
              tab === k ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {k === 'preset' ? '预设' : k === 'relative' ? '相对' : '绝对'}
          </button>
        ))}
      </div>

      {tab === 'preset' && (
        <div className="grid grid-cols-2 gap-1.5 max-h-48 overflow-y-auto">
          {presets.map(p => (
            <button
              key={p.label}
              type="button"
              onClick={() => {
                const spec = p.getSpec();
                commit(spec);
                close();
              }}
              className="px-2 py-1.5 text-xs rounded border border-gray-200 text-gray-600 hover:bg-blue-50 hover:border-blue-300"
            >
              {p.label}
            </button>
          ))}
        </div>
      )}

      {tab === 'relative' && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-gray-500">查询时刻往前</span>
            <input
              type="number"
              min={0}
              value={relAmt}
              onChange={e => setRelAmt(Math.max(0, parseInt(e.target.value, 10) || 0))}
              className="w-14 border border-gray-300 rounded px-1 py-0.5 text-xs text-center"
            />
            <select
              value={relUnit}
              onChange={e => setRelUnit(e.target.value as TimeRelativeUnit)}
              className="border border-gray-300 rounded px-1 py-0.5 text-xs"
            >
              {TIME_RELATIVE_UNITS.map(u => (
                <option key={u.value} value={u.value}>
                  {u.label}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={() => {
              applyRelativeToSide();
              close();
            }}
            className="w-full bg-blue-500 text-white text-xs py-1.5 rounded-md hover:bg-blue-600"
          >
            应用
          </button>
        </div>
      )}

      {tab === 'absolute' && (
        <div className="space-y-1">
          <label className="text-xs text-gray-500">选择日期（yyyy-MM-dd）</label>
          <DatePicker
            selected={
              work[side].kind === 'absolute' && work[side].date?.trim()
                ? parseYmdToLocalDate(work[side].date!)
                : null
            }
            onChange={(d: Date | null) => applyAbsoluteDate(d)}
            dateFormat="yyyy-MM-dd"
            placeholderText="点击选择"
            className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm"
          />
        </div>
      )}
    </div>
  );

  return (
    <div className="relative flex items-center gap-1.5 min-w-0 flex-1 max-w-full">
      <button
        ref={startRef}
        type="button"
        disabled={disabled}
        onClick={() => openFor('start')}
        className={triggerCls}
      >
        <span className="text-gray-400 text-[10px] shrink-0 leading-none">开始</span>
        <span className="text-gray-800 font-medium min-w-0 truncate">{formatTimeBoundDisplay(value.start)}</span>
      </button>
      <span className="text-gray-300 shrink-0 text-xs">~</span>
      <button
        ref={endRef}
        type="button"
        disabled={disabled}
        onClick={() => openFor('end')}
        className={triggerCls}
      >
        <span className="text-gray-400 text-[10px] shrink-0 leading-none">结束</span>
        <span className="text-gray-800 font-medium min-w-0 truncate">{formatTimeBoundDisplay(value.end)}</span>
      </button>

      {open &&
        !disabled &&
        typeof document !== 'undefined' &&
        createPortal(panel, document.body)}
    </div>
  );
}
