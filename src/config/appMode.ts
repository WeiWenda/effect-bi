/** 解析 Vite 布尔环境变量（true / 1 / yes，不区分大小写） */
function parseBoolEnv(value: string | undefined): boolean {
  if (value == null || value === '') return false;
  const v = value.trim().toLowerCase();
  return v === 'true' || v === '1' || v === 'yes';
}

/**
 * 仅元数据管理模式：隐藏 ETL、Cube、可视化查询、看板，保留 Table Meta / 链路治理等。
 * 构建时设置 `VITE_META_ONLY=true`（修改后需重启 Vite）。
 */
export const isMetaOnlyMode = parseBoolEnv(import.meta.env.VITE_META_ONLY);

/** 登录后默认落地页 */
export const defaultAppPath = isMetaOnlyMode ? '/lineage' : '/chat';

/** 元数据模式下不可直接访问的路由前缀 */
const META_ONLY_BLOCKED_PREFIXES = ['/etl', '/cube', '/query', '/dashboard'] as const;

export function isPathBlockedInMetaOnlyMode(pathname: string): boolean {
  if (!isMetaOnlyMode) return false;
  return META_ONLY_BLOCKED_PREFIXES.some(
    prefix => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}
