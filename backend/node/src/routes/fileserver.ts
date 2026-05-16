import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { getTaskHome, resolveTaskFilePath } from '../config/taskHome.js';

const router: Router = Router();

const FILE_EXT_CANDIDATES = ['', '.sql', '.py', '.hql'];

function findReadableTaskFile(basePath: string): string | null {
  for (const ext of FILE_EXT_CANDIDATES) {
    const candidate = ext ? `${basePath}${ext}` : basePath;
    if (!fs.existsSync(candidate)) continue;
    const stats = fs.statSync(candidate);
    if (stats.isFile()) return candidate;
  }
  return null;
}

/**
 * Get task file content
 * GET /api/file/task?file=xxx
 */
router.get('/task', async (req: Request, res: Response): Promise<void> => {
  try {
    const { file } = req.query;

    if (!file || typeof file !== 'string') {
      res.status(400).json({ error: 'File parameter is required' });
      return;
    }

    const resolvedBase = resolveTaskFilePath(file);
    if (!resolvedBase) {
      res.status(403).json({ error: 'Access denied: path outside TASK_HOME' });
      return;
    }

    const taskHome = getTaskHome();
    const readablePath = findReadableTaskFile(resolvedBase);

    if (!readablePath) {
      res.status(404).json({
        error: 'Task file not found',
        file,
        taskHome,
        resolved: resolvedBase,
      });
      return;
    }

    const content = fs.readFileSync(readablePath, 'utf-8');
    res.json({ content, path: path.relative(taskHome, readablePath).replace(/\\/g, '/') });
  } catch (error) {
    console.error('Error reading task file:', error);
    res.status(500).json({ error: 'Failed to read task file' });
  }
});

export default router;
