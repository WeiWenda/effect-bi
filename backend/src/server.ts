import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
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

dotenv.config();

const app: Express = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
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
