/**
 * Creates PostgreSQL schema `demo` and 20 demo tables for local testing
 * (运行依赖 / 产出表 等选择器的占位数据).
 *
 * Env: `backend/node/.env` (PG_HOST, PG_PORT, PG_DATABASE, PG_USER, PG_PASSWORD).
 * Tables are created under schema **`demo`** (not `public`). List with:
 *   psql: `\dn demo` then `\dt demo.*`
 *   SQL: `SELECT tablename FROM pg_tables WHERE schemaname = 'demo';`
 * Docker pgvector default from host: PG_HOST=127.0.0.1 PG_PORT=5434 PG_DATABASE=lineage PG_USER=stack
 *
 * Run: `cd backend/node && npm run mock-table`
 */
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import type { PoolClient } from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

const { pool } = await import('../src/config/postgres.js');

/** Safe for use as unquoted PostgreSQL role identifier in GRANT … TO … */
function pgRoleIdent(raw: string): string {
  if (!/^[a-zA-Z_][a-zA-Z0-9_$]*$/.test(raw)) {
    throw new Error(`PG_USER is not a safe SQL identifier: ${JSON.stringify(raw)}`);
  }
  return raw;
}

const DDL: string[] = [
  `CREATE TABLE IF NOT EXISTS demo.dim_customer (
    customer_id     BIGSERIAL PRIMARY KEY,
    external_ref    VARCHAR(64),
    full_name       VARCHAR(200) NOT NULL,
    email           VARCHAR(320),
    country_code    CHAR(2),
    loyalty_tier    VARCHAR(32),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS demo.dim_product (
    product_id      BIGSERIAL PRIMARY KEY,
    sku             VARCHAR(64) NOT NULL UNIQUE,
    title           VARCHAR(500) NOT NULL,
    category_id     BIGINT,
    brand           VARCHAR(128),
    unit_price      NUMERIC(18,4),
    is_active       BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS demo.dim_region (
    region_id       BIGSERIAL PRIMARY KEY,
    code            VARCHAR(16) NOT NULL UNIQUE,
    name            VARCHAR(128) NOT NULL,
    timezone        VARCHAR(64),
    parent_region_id BIGINT
  )`,

  `CREATE TABLE IF NOT EXISTS demo.dim_date (
    d_date          DATE PRIMARY KEY,
    year            SMALLINT NOT NULL,
    quarter         SMALLINT NOT NULL,
    month           SMALLINT NOT NULL,
    day_of_month    SMALLINT NOT NULL,
    day_of_week     SMALLINT NOT NULL,
    is_weekend      BOOLEAN NOT NULL
  )`,

  `CREATE TABLE IF NOT EXISTS demo.fact_orders (
    order_id        BIGSERIAL PRIMARY KEY,
    customer_id     BIGINT NOT NULL,
    order_ts        TIMESTAMPTZ NOT NULL,
    region_id       BIGINT,
    total_amount    NUMERIC(18,4),
    currency        CHAR(3) NOT NULL DEFAULT 'USD',
    status          VARCHAR(32) NOT NULL,
    source_channel  VARCHAR(64)
  )`,

  `CREATE TABLE IF NOT EXISTS demo.fact_order_lines (
    line_id         BIGSERIAL PRIMARY KEY,
    order_id        BIGINT NOT NULL,
    product_id      BIGINT NOT NULL,
    qty             INTEGER NOT NULL,
    unit_price      NUMERIC(18,4),
    discount_amount NUMERIC(18,4) DEFAULT 0,
    line_amount     NUMERIC(18,4),
    inserted_at     TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS demo.agg_daily_sales (
    sale_date       DATE NOT NULL,
    region_id       BIGINT NOT NULL,
    gross_sales     NUMERIC(18,4),
    order_count     INTEGER,
    avg_order_value NUMERIC(18,4),
    PRIMARY KEY (sale_date, region_id)
  )`,

  `CREATE TABLE IF NOT EXISTS demo.stg_web_events_raw (
    event_id        BIGSERIAL PRIMARY KEY,
    session_id      VARCHAR(64) NOT NULL,
    event_ts        TIMESTAMPTZ NOT NULL,
    event_type      VARCHAR(32),
    page_url        TEXT,
    referrer        TEXT,
    user_agent      TEXT,
    payload_json    JSONB
  )`,

  `CREATE TABLE IF NOT EXISTS demo.stg_inventory_snapshot (
    snapshot_ts     TIMESTAMPTZ NOT NULL,
    product_id      BIGINT NOT NULL,
    warehouse_code  VARCHAR(32) NOT NULL DEFAULT '',
    qty_on_hand     INTEGER NOT NULL,
    PRIMARY KEY (snapshot_ts, product_id, warehouse_code)
  )`,

  `CREATE TABLE IF NOT EXISTS demo.dim_campaign (
    campaign_id     BIGSERIAL PRIMARY KEY,
    code            VARCHAR(64) NOT NULL UNIQUE,
    name            VARCHAR(256) NOT NULL,
    channel         VARCHAR(64),
    start_date      DATE,
    end_date        DATE,
    budget_amount   NUMERIC(18,2)
  )`,

  `CREATE TABLE IF NOT EXISTS demo.bridge_campaign_touch (
    touch_id        BIGSERIAL PRIMARY KEY,
    customer_id     BIGINT NOT NULL,
    campaign_id     BIGINT NOT NULL,
    touch_ts        TIMESTAMPTZ NOT NULL,
    touch_type      VARCHAR(32),
    attributed_weight NUMERIC(5,4)
  )`,

  `CREATE TABLE IF NOT EXISTS demo.fact_returns (
    return_id       BIGSERIAL PRIMARY KEY,
    order_id        BIGINT NOT NULL,
    product_id      BIGINT NOT NULL,
    return_ts       TIMESTAMPTZ NOT NULL,
    reason_code     VARCHAR(64),
    refund_amount   NUMERIC(18,4),
    restock_flag    BOOLEAN DEFAULT true
  )`,

  `CREATE TABLE IF NOT EXISTS demo.mart_customer_360 (
    customer_id     BIGINT NOT NULL,
    as_of_date      DATE NOT NULL,
    ltv_score       NUMERIC(12,4),
    segment         VARCHAR(64),
    churn_risk      NUMERIC(5,4),
    last_order_ts   TIMESTAMPTZ,
    PRIMARY KEY (customer_id, as_of_date)
  )`,

  `CREATE TABLE IF NOT EXISTS demo.ref_exchange_rates (
    rate_date       DATE NOT NULL,
    currency        CHAR(3) NOT NULL,
    rate_to_usd     NUMERIC(18,8) NOT NULL,
    PRIMARY KEY (rate_date, currency)
  )`,

  `CREATE TABLE IF NOT EXISTS demo.dim_store (
    store_id        BIGSERIAL PRIMARY KEY,
    region_id       BIGINT,
    code            VARCHAR(32) NOT NULL UNIQUE,
    name            VARCHAR(200),
    opened_on       DATE,
    square_meters   INTEGER,
    format_type     VARCHAR(32)
  )`,

  `CREATE TABLE IF NOT EXISTS demo.stg_pos_transactions (
    txn_id          BIGSERIAL PRIMARY KEY,
    store_id        BIGINT NOT NULL,
    txn_ts          TIMESTAMPTZ NOT NULL,
    payment_method  VARCHAR(32),
    card_last4      VARCHAR(4),
    amount          NUMERIC(18,4) NOT NULL,
    cashier_id      VARCHAR(64)
  )`,

  `CREATE TABLE IF NOT EXISTS demo.agg_hourly_traffic (
    bucket_ts       TIMESTAMPTZ NOT NULL,
    channel         VARCHAR(32) NOT NULL,
    visits          BIGINT,
    conversions     BIGINT,
    revenue_proxy   NUMERIC(18,4),
    PRIMARY KEY (bucket_ts, channel)
  )`,

  `CREATE TABLE IF NOT EXISTS demo.quality_check_results (
    check_id        BIGSERIAL PRIMARY KEY,
    target_schema   VARCHAR(64),
    table_name      VARCHAR(128) NOT NULL,
    run_ts          TIMESTAMPTZ NOT NULL DEFAULT now(),
    passed          BOOLEAN NOT NULL,
    rule_name       VARCHAR(128),
    detail_json     JSONB
  )`,

  `CREATE TABLE IF NOT EXISTS demo.dim_sku_attributes (
    product_id      BIGINT PRIMARY KEY,
    color           VARCHAR(64),
    weight_kg       NUMERIC(10,3),
    hazmat_flag     BOOLEAN NOT NULL DEFAULT false,
    shelf_life_days INTEGER,
    attrs_json      JSONB
  )`,

  `CREATE TABLE IF NOT EXISTS demo.fact_shipments (
    shipment_id     BIGSERIAL PRIMARY KEY,
    order_id        BIGINT NOT NULL,
    carrier         VARCHAR(64),
    ship_ts         TIMESTAMPTZ,
    delivered_ts    TIMESTAMPTZ,
    tracking_no     VARCHAR(128),
    freight_cost    NUMERIC(18,4)
  )`,
];

async function grantDemoPrivileges(client: PoolClient): Promise<void> {
  const role = pgRoleIdent(process.env.PG_USER || 'postgres');
  await client.query(`GRANT USAGE ON SCHEMA demo TO ${role}`);
  await client.query(`GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA demo TO ${role}`);
  await client.query(`GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA demo TO ${role}`);
  await client.query(
    `ALTER DEFAULT PRIVILEGES IN SCHEMA demo GRANT ALL ON TABLES TO ${role}`,
  );
  await client.query(
    `ALTER DEFAULT PRIVILEGES IN SCHEMA demo GRANT ALL ON SEQUENCES TO ${role}`,
  );
}

function connectionSummary(): string {
  const host = process.env.PG_HOST || 'localhost';
  const port = process.env.PG_PORT || '5432';
  const database = process.env.PG_DATABASE || 'lineage';
  const user = process.env.PG_USER || 'postgres';
  return `${user}@${host}:${port}/${database}`;
}

async function main(): Promise<void> {
  console.log(`Connecting as ${connectionSummary()} — confirm this matches where you inspect tables.\n`);

  const client = await pool.connect();
  try {
    console.log('Creating schema demo (if not exists)…');
    await client.query('CREATE SCHEMA IF NOT EXISTS demo');
    console.log(`Creating ${DDL.length} demo tables under demo.* …`);
    for (const sql of DDL) {
      await client.query(sql);
    }
    await grantDemoPrivileges(client);

    const verify = await client.query<{ tablename: string }>(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'demo' ORDER BY tablename`,
    );
    console.log('');
    console.log(`Verified in database: ${verify.rows.length} tables in schema "demo":`);
    for (const row of verify.rows) {
      console.log(`  demo.${row.tablename}`);
    }
    if (verify.rows.length === 0) {
      console.warn('Warning: no tables listed in pg_tables for schema demo — check permissions or wrong database.');
    }
    console.log('');
    console.log(
      `Done. GRANT applied to role ${process.env.PG_USER || 'postgres'}. If your UI shows only "public", expand schema **demo**.`,
    );
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
