-- Sample migration helper for integration tables
CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE IF EXISTS connector_configs RENAME TO integrations;
ALTER TABLE integrations RENAME COLUMN connector_type TO integration_type;

ALTER TABLE integrations
    ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(),
    ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

CREATE TABLE IF NOT EXISTS integration_syncs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    integration_id uuid NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,
    status varchar(32) NOT NULL DEFAULT 'queued',
    payload jsonb,
    message text,
    task_id text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION update_timestamp_column()
RETURNS TRIGGER AS
'BEGIN NEW.updated_at = now(); RETURN NEW; END;'
LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_integration_syncs_updated_at ON integration_syncs;
CREATE TRIGGER trg_integration_syncs_updated_at
BEFORE UPDATE ON integration_syncs
FOR EACH ROW EXECUTE FUNCTION update_timestamp_column();
