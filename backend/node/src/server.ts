import './loadEnv.js';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { closeDriver } from './config/neo4j.js';
import lineageRoutes from './routes/lineage.js';
import dagRoutes from './routes/dag.js';
import fileserverRoutes from './routes/fileserver.js';
import taskRoutes from './routes/task.js';
import cubeRoutes from './routes/cube.js';
import chartRoutes from './routes/chart.js';
import dashboardRoutes from './routes/dashboard.js';
import cubeProxyRoutes from './routes/cubeProxy.js';
import etlRoutes from './routes/etl.js';

const app: Express = express();
const PORT = process.env.PORT || 3001;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const staticDir = path.join(__dirname, '..', 'static');

function optionalOriginProxy(mount: string, envName: string): void {
  const raw = process.env[envName]?.trim();
  if (!raw) return;
  const target = raw.replace(/\/$/, '');
  app.use(
    mount,
    createProxyMiddleware({
      target,
      changeOrigin: true,
      pathRewrite: (pathStr) => {
        if (!pathStr.startsWith(mount)) return pathStr;
        const rest = pathStr.slice(mount.length);
        return rest || '/';
      },
    }),
  );
}

// Middleware — proxies before express.json() so streamed / JSON bodies forward intact
app.use(cors());
optionalOriginProxy('/langgraph', 'LANGGRAPH_ORIGIN');
optionalOriginProxy('/gravitino', 'GRAVITINO_ORIGIN');
app.use(express.json());

// Routes
app.use('/api/lineage', lineageRoutes);
app.use('/api/dag', dagRoutes);
app.use('/api/file', fileserverRoutes);
app.use('/api/task', taskRoutes);
app.use('/api/cube', cubeRoutes);
app.use('/api/chart', chartRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/cube-proxy', cubeProxyRoutes);
app.use('/api/etl', etlRoutes);

// Health check
app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// React SPA (when ../static exists, e.g. Docker or local copy of `vite build` output)
if (fs.existsSync(staticDir)) {
  app.use(express.static(staticDir, { index: false }));
  // Express 5 / path-to-regexp: bare "*" is invalid; "{*splat}" includes "/" (see migrating-5.html#path-syntax)
  app.get('/{*splat}', (req: Request, res: Response, next: NextFunction) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    if (req.path.startsWith('/api/') || req.path === '/health') return next();
    if (req.path.startsWith('/langgraph')) {
      if (process.env.LANGGRAPH_ORIGIN?.trim()) return next();
      res.status(503).json({ error: 'LANGGRAPH_ORIGIN is not set' });
      return;
    }
    if (req.path.startsWith('/gravitino')) {
      if (process.env.GRAVITINO_ORIGIN?.trim()) return next();
      res.status(503).json({ error: 'GRAVITINO_ORIGIN is not set' });
      return;
    }
    res.sendFile(path.join(staticDir, 'index.html'), (err) => {
      if (err) next(err);
    });
  });
}

// Error handling
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// Start server
const server = app.listen(PORT, () => {
  console.log(`Lineage backend server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
  });
  await closeDriver();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
  });
  await closeDriver();
  process.exit(0);
});

export default app;
