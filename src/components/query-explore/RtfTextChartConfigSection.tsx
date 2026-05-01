import type { RtfTextChartConfig } from '../../types/chart';

interface RtfTextChartConfigSectionProps {
  value: RtfTextChartConfig;
  onChange: (next: RtfTextChartConfig) => void;
}

export function RtfTextChartConfigSection({ value, onChange }: RtfTextChartConfigSectionProps): React.JSX.Element {
  const patch = (p: Partial<RtfTextChartConfig>) => onChange({ ...value, ...p });

  return (
    <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50/40 p-3">
      <div className="text-xs font-semibold text-amber-900">文本图</div>
      <p className="text-[10px] leading-snug text-amber-900/80">
        不使用维度。可不选指标，仅写静态文案；若有指标，可在模板中用 <code className="rounded bg-white/80 px-0.5">{'{字段名}'}</code>{' '}
        引用其值（字段名与指标 field 一致，如 <code className="rounded bg-white/80 px-0.5">ViewName.measure</code>）。
      </p>
      <label className="block">
        <span className="text-[10px] font-medium text-gray-600">插值表达式 / 模板</span>
        <textarea
          value={value.interpolationExpression}
          onChange={e => patch({ interpolationExpression: e.target.value })}
          rows={4}
          className="mt-1 w-full rounded border border-gray-200 bg-white p-2 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-amber-400"
          placeholder={'例如：合计 {Orders.totalAmount} 元，共 {Orders.count} 笔'}
        />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="text-[10px] font-medium text-gray-600">字号 (px)</span>
          <input
            type="number"
            min={8}
            max={96}
            value={value.fontSizePx}
            onChange={e => patch({ fontSizePx: Math.max(8, Math.min(96, parseInt(e.target.value, 10) || 14)) })}
            className="mt-1 w-full rounded border border-gray-200 bg-white px-2 py-1 text-xs"
          />
        </label>
        <label className="block">
          <span className="text-[10px] font-medium text-gray-600">文字颜色</span>
          <div className="mt-1 flex gap-1">
            <input
              type="color"
              value={value.color.startsWith('#') ? value.color : `#${value.color}`}
              onChange={e => patch({ color: e.target.value })}
              className="h-8 w-10 cursor-pointer rounded border border-gray-200 bg-white p-0.5"
            />
            <input
              type="text"
              value={value.color}
              onChange={e => patch({ color: e.target.value })}
              className="min-w-0 flex-1 rounded border border-gray-200 bg-white px-2 py-1 font-mono text-xs"
            />
          </div>
        </label>
      </div>
      <label className="block">
        <span className="text-[10px] font-medium text-gray-600">字体（CSS font-family，亦写入 RTF 字体表）</span>
        <input
          type="text"
          value={value.fontFamily}
          onChange={e => patch({ fontFamily: e.target.value })}
          className="mt-1 w-full rounded border border-gray-200 bg-white px-2 py-1 text-xs"
          placeholder="system-ui, Microsoft YaHei, sans-serif"
        />
      </label>
    </div>
  );
}
