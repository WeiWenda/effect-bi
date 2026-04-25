import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const router: Router = Router();

const TASK_HOME = process.env.TASK_HOME || '/opt/tasks';

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

    // Security check: prevent path traversal
    // File parameter is a relative path from TASK_HOME
    const filePath = path.join(TASK_HOME, file);

    console.log('TASK_HOME:', TASK_HOME);
    console.log('Requested file:', file);
    console.log('Full file path:', filePath);

    // Security: ensure the path is within TASK_HOME
    const resolvedPath = path.resolve(filePath);
    const resolvedTaskHome = path.resolve(TASK_HOME);
    if (!resolvedPath.startsWith(resolvedTaskHome)) {
      res.status(403).json({ error: 'Access denied: path outside TASK_HOME' });
      return;
    }

    // Check if file exists
    if (!fs.existsSync(filePath)) {
      res.status(404).json({ error: 'Task file not found' });
      return;
    }

    // Check if it's a file (not a directory)
    const stats = fs.statSync(filePath);
    if (!stats.isFile()) {
      res.status(400).json({ error: 'Path is not a file' });
      return;
    }

    // Read file content
    const content = fs.readFileSync(filePath, 'utf-8');

    res.json({ content });
  } catch (error) {
    console.error('Error reading task file:', error);
    res.status(500).json({ error: 'Failed to read task file' });
  }
});

export default router;
