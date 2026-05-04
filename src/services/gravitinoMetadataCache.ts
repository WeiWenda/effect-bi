/**
 * In-memory deduped fetches for Gravitino catalog / database (namespace) / table lists
 * (shared across runtime-deps modal, output table picker, etc.).
 */
import { gravitinoAPI } from './gravitinoApi';

let catalogsPromise: Promise<string[]> | null = null;
const databasePromises = new Map<string, Promise<string[]>>();
const tablePromises = new Map<string, Promise<string[]>>();

export async function fetchCatalogNamesCached(): Promise<string[]> {
  if (!catalogsPromise) {
    catalogsPromise = gravitinoAPI.listCatalogs().then(r => r.identifiers.map(i => i.name));
  }
  return catalogsPromise;
}

export async function fetchDatabaseNamesCached(catalog: string): Promise<string[]> {
  const c = catalog.trim();
  if (!c) return [];
  let p = databasePromises.get(c);
  if (!p) {
    p = gravitinoAPI.listSchemas(c).then(r => r.identifiers.map(i => i.name));
    databasePromises.set(c, p);
  }
  return p;
}

export async function fetchTableNamesCached(catalog: string, database: string): Promise<string[]> {
  const c = catalog.trim();
  const d = database.trim();
  if (!c || !d) return [];
  const k = `${c}\0${d}`;
  let p = tablePromises.get(k);
  if (!p) {
    p = gravitinoAPI.listTables(c, d).then(r => r.identifiers.map(i => i.name));
    tablePromises.set(k, p);
  }
  return p;
}

/** Dev / tests only — optional */
export function invalidateGravitinoMetadataCache(): void {
  catalogsPromise = null;
  databasePromises.clear();
  tablePromises.clear();
}
