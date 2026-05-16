import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(here, '../../.env') });

/** TASK_HOME：DataWorks 仓库根目录，Neo4j `file_path` 为其下相对路径 */
export function getTaskHome(): string {
  return path.resolve(process.env.TASK_HOME || '/opt/tasks');
}

/**
 * 将 API 的 `file` 参数解析为 TASK_HOME 下的绝对路径（防目录穿越）。
 * 支持相对路径；若传入已在 TASK_HOME 下的绝对路径也可解析。
 */
export function resolveTaskFilePath(fileParam: string): string | null {
  const trimmed = fileParam.trim();
  if (!trimmed) return null;

  const taskHome = getTaskHome();
  const candidate = path.isAbsolute(trimmed)
    ? path.resolve(trimmed)
    : path.resolve(taskHome, trimmed);

  const homeWithSep = taskHome.endsWith(path.sep) ? taskHome : taskHome + path.sep;
  if (candidate !== taskHome && !candidate.startsWith(homeWithSep)) {
    return null;
  }
  return candidate;
}
