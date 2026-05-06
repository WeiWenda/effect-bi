import type { RtfTextChartConfig } from '../types/chart';

/** 与页面展示一致的可读默认；旧数据缺字段时补齐 */
export const DEFAULT_RTF_TEXT_CHART_CONFIG: RtfTextChartConfig = {
  interpolationExpression: '',
  fontSizePx: 14,
  color: '#111827',
  backgroundColor: '#fffbeb',
};

/** 合并 API/草稿中的 rtfTextConfig，忽略已废弃的 fontFamily */
export function normalizeRtfTextChartConfig(
  raw?: Partial<RtfTextChartConfig> & { fontFamily?: string } | null
): RtfTextChartConfig {
  if (raw == null) return { ...DEFAULT_RTF_TEXT_CHART_CONFIG };
  const bg =
    typeof raw.backgroundColor === 'string' && raw.backgroundColor.trim()
      ? raw.backgroundColor.trim()
      : DEFAULT_RTF_TEXT_CHART_CONFIG.backgroundColor;
  return {
    interpolationExpression:
      typeof raw.interpolationExpression === 'string' ? raw.interpolationExpression : '',
    fontSizePx:
      typeof raw.fontSizePx === 'number' && Number.isFinite(raw.fontSizePx)
        ? raw.fontSizePx
        : DEFAULT_RTF_TEXT_CHART_CONFIG.fontSizePx,
    color:
      typeof raw.color === 'string' && raw.color.trim()
        ? raw.color.trim()
        : DEFAULT_RTF_TEXT_CHART_CONFIG.color,
    backgroundColor: bg,
  };
}

function linearizeSrgbChannel(c: number): number {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

function relativeLuminanceRgb(r: number, g: number, b: number): number {
  return (
    0.2126 * linearizeSrgbChannel(r) +
    0.7152 * linearizeSrgbChannel(g) +
    0.0722 * linearizeSrgbChannel(b)
  );
}

function parseCssColorToRgb(input: string): { r: number; g: number; b: number } | null {
  const s = input.trim();
  const hexMatch = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(s);
  if (hexMatch) {
    let h = hexMatch[1];
    if (h.length === 3) {
      h = h
        .split('')
        .map(ch => ch + ch)
        .join('');
    }
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16),
    };
  }
  const rgbMatch = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/i.exec(s);
  if (rgbMatch) {
    return {
      r: Math.min(255, parseInt(rgbMatch[1], 10)),
      g: Math.min(255, parseInt(rgbMatch[2], 10)),
      b: Math.min(255, parseInt(rgbMatch[3], 10)),
    };
  }
  return null;
}

/**
 * 根据文本块背景色生成协调的实线边框色（偏浅背景略压暗，偏深背景略提亮）。
 */
export function borderColorForBackground(cssColor: string): string {
  const rgb = parseCssColorToRgb(cssColor);
  if (!rgb) return 'rgba(15, 23, 42, 0.14)';
  const L = relativeLuminanceRgb(rgb.r, rgb.g, rgb.b);
  const darken = 0.2;
  const lighten = 0.32;
  if (L > 0.52) {
    const r = Math.round(rgb.r * (1 - darken));
    const g = Math.round(rgb.g * (1 - darken));
    const b = Math.round(rgb.b * (1 - darken));
    return `rgb(${Math.max(0, r)},${Math.max(0, g)},${Math.max(0, b)})`;
  }
  const r = Math.round(rgb.r + (255 - rgb.r) * lighten);
  const g = Math.round(rgb.g + (255 - rgb.g) * lighten);
  const b = Math.round(rgb.b + (255 - rgb.b) * lighten);
  return `rgb(${Math.min(255, r)},${Math.min(255, g)},${Math.min(255, b)})`;
}

/**
 * 将模板中的 `{字段名}` 替换为当前行对应列的值（字段名与 Cube 返回 key 一致）。
 */
export function interpolateMetricTemplate(template: string, row: Record<string, unknown>): string {
  return template.replace(/\{([^}]+)\}/g, (_m, rawKey: string) => {
    const key = String(rawKey).trim();
    const v = row[key];
    if (v == null) return '';
    if (typeof v === 'number' && Number.isFinite(v)) return String(v);
    return String(v);
  });
}

/** RTF 特殊字符转义 */
function escapeRtfText(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/{/g, '\\{')
    .replace(/}/g, '\\}')
    .replace(/\r\n|\n|\r/g, '\\line ');
}

/**
 * 生成极简 RTF 段落（单段、单色、单字体），便于复制到 Word 等。
 * fontSizePx 会换算为 RTF 半磅单位 \\fs。
 */
export function buildMinimalRtfParagraph(
  plainText: string,
  cfg: Pick<RtfTextChartConfig, 'fontSizePx' | 'color'>
): string {
  const escaped = escapeRtfText(plainText);
  const fs = Math.max(8, Math.round(Number(cfg.fontSizePx) || 14) * 2);
  let hex = String(cfg.color || '#000000').replace(/^#/, '');
  if (hex.length === 3) {
    hex = hex
      .split('')
      .map(ch => ch + ch)
      .join('');
  }
  const r = parseInt(hex.slice(0, 2), 16) || 0;
  const g = parseInt(hex.slice(2, 4), 16) || 0;
  const b = parseInt(hex.slice(4, 6), 16) || 0;
  const font = escapeRtfText('Microsoft YaHei');
  return `{\\rtf1\\ansi\\deff0{\\fonttbl{\\f0 ${font};}}{\\colortbl;\\red${r}\\green${g}\\blue${b};}\\f0\\fs${fs}\\cf1 ${escaped}\\par}`;
}
