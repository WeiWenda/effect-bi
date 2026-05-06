import dotenv from 'dotenv';
import { runMigrations } from '../src/runMigrations.js';

dotenv.config();

runMigrations().catch((error: unknown) => {
  console.error('Error running migration:', error);
  process.exit(1);
});
