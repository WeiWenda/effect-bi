/**
 * Creates 20 demo tables under PostgreSQL schema `demo` for local testing
 * (运行依赖 / 产出表 等选择器的占位数据).
 *
 * Run from backend/:  npx tsx scripts/mock-table.ts
 */
import { pool } from '../src/config/postgres.js';
import dotenv from 'dotenv';

dotenv.config();

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

async function main(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('CREATE SCHEMA IF NOT EXISTS demo');
    for (const sql of DDL) {
      await client.query(sql);
    }
    console.log(`demo schema: ensured ${DDL.length} tables exist (CREATE IF NOT EXISTS).`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
