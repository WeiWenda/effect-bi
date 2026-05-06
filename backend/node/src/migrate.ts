/**
 * CLI entry: `node dist/migrate.js` (Docker entrypoint) or `tsx src/migrate.ts`.
 */
import { runMigrations } from './runMigrations.js';

runMigrations().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
