/**
 * Load `backend/.env` regardless of process cwd (e.g. monorepo root or dev-services).
 * Import this first from server entry only.
 */
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const here = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(here, '../.env');
dotenv.config({ path: envPath });
