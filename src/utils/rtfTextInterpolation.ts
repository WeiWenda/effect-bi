import type { MetricConfig, RtfTextChartConfig } from '../types/chart';

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
  cfg: Pick<RtfTextChartConfig, 'fontSizePx' | 'color' | 'fontFamily'>
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
  const font = escapeRtfText(cfg.fontFamily || 'Arial');
  return `{\\rtf1\\ansi\\deff0{\\fonttbl{\\f0 ${font};}}{\\colortbl;\\red${r}\\green${g}\\blue${b};}\\f0\\fs${fs}\\cf1 ${escaped}\\par}`;
}
