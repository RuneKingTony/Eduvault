-- migrate:up
ALTER TABLE fee_line ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- migrate:down
ALTER TABLE fee_line DROP COLUMN updated_at;
