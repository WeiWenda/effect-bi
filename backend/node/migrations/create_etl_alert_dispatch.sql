-- Queued alert deliveries (delayed send, external dispatch-tick)
CREATE TABLE IF NOT EXISTS etl_alert_dispatch (
  id BIGSERIAL PRIMARY KEY,
  source VARCHAR(64) NOT NULL,
  etl_task_version_id INTEGER REFERENCES etl_task_versions(id) ON DELETE SET NULL,
  task_instance_id INTEGER REFERENCES etl_task_run_instances(id) ON DELETE SET NULL,
  reason TEXT NOT NULL,
  payload_json JSONB NOT NULL DEFAULT '{}',
  channel VARCHAR(32) NOT NULL DEFAULT 'im_webhook',
  scheduled_send_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  send_status VARCHAR(32) NOT NULL DEFAULT 'pending'
    CHECK (send_status IN ('pending', 'sent', 'skipped', 'failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_etl_alert_dispatch_pending_tick
  ON etl_alert_dispatch (send_status, scheduled_send_at);

CREATE INDEX IF NOT EXISTS idx_etl_alert_dispatch_version
  ON etl_alert_dispatch (etl_task_version_id);
