import type { PoolClient } from 'pg';

export async function isPartitionReady(
  client: PoolClient,
  params: {
    catalog: string;
    database: string;
    table: string;
    primaryPartitionKey: string;
    secondaryNormalized: string;
  }
): Promise<boolean> {
  const r = await client.query(
    `SELECT 1 FROM etl_table_partition_detail
     WHERE catalog_name = $1 AND database_name = $2 AND table_name = $3
       AND primary_partition_key = $4
       AND secondary_partition_key = $5
       AND is_verified = true
     LIMIT 1`,
    [params.catalog, params.database, params.table, params.primaryPartitionKey, params.secondaryNormalized]
  );
  return r.rows.length > 0;
}

export async function upsertPartitionDetail(
  client: PoolClient,
  params: {
    catalog: string;
    database: string;
    table: string;
    primaryPartitionKey: string;
    secondaryNormalized: string;
    partitionDate: string;
    etlTaskVersionId: number | null;
    isVerified: boolean;
    runningStatus?: 'idle' | 'running' | 'succeeded' | 'quality_rejected' | 'failed';
  }
): Promise<number> {
  const runningStatus =
    params.runningStatus ?? (params.isVerified ? 'succeeded' : 'quality_rejected');
  const r = await client.query(
    `INSERT INTO etl_table_partition_detail (
       catalog_name, database_name, table_name,
       primary_partition_key, secondary_partition_key, partition_date,
       etl_task_version_id, is_verified, running_status, last_success_at
     ) VALUES ($1, $2, $3, $4, $5, $6::date, $7, $8, $9, CURRENT_TIMESTAMP)
     ON CONFLICT ON CONSTRAINT etl_table_partition_detail_unique
     DO UPDATE SET
       etl_task_version_id = COALESCE(EXCLUDED.etl_task_version_id, etl_table_partition_detail.etl_task_version_id),
       is_verified = EXCLUDED.is_verified,
       running_status = EXCLUDED.running_status,
       last_success_at = CURRENT_TIMESTAMP,
       partition_date = EXCLUDED.partition_date
     RETURNING id`,
    [
      params.catalog,
      params.database,
      params.table,
      params.primaryPartitionKey,
      params.secondaryNormalized,
      params.partitionDate,
      params.etlTaskVersionId,
      params.isVerified,
      runningStatus,
    ]
  );
  return r.rows[0].id as number;
}
