/**
 * Resolve ETL partition expressions (e.g. -1 day) against Airflow logical date.
 */
/** Normalized secondary partition key for storage (empty string if none). */
export function normalizeSecondaryPartitions(raw: string | undefined | null): string {
  if (raw == null || String(raw).trim() === '') return '';
  const parts = String(raw)
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
  return parts.length === 0 ? '' : parts.join(',');
}

/** Resolve partition column value string for storage / lookup */
export function resolvePrimaryPartitionKey(partitionExpr: string, logicalDateIso: string): string {
  const trimmed = partitionExpr.trim();
  const rel = /^-\s*(\d+)\s*day$/i.exec(trimmed);
  if (rel) {
    const n = parseInt(rel[1], 10);
    const d = new Date(logicalDateIso);
    if (Number.isNaN(d.getTime())) {
      throw new Error(`Invalid logicalDate: ${logicalDateIso}`);
    }
    d.setUTCDate(d.getUTCDate() - n);
    return d.toISOString().slice(0, 10);
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }
  return trimmed;
}

export function partitionDateFromKey(primaryKey: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(primaryKey)) {
    return primaryKey;
  }
  return new Date().toISOString().slice(0, 10);
}
