-- migrate:up
ALTER TABLE adjustment
  ADD COLUMN reference TEXT CHECK (char_length(btrim(reference)) BETWEEN 1 AND 80),
  ADD COLUMN request_hash TEXT,
  ADD CONSTRAINT adjustment_reference_hash CHECK ((reference IS NULL) = (request_hash IS NULL));

CREATE UNIQUE INDEX adjustment_reference_key ON adjustment (organization_id, reference)
  WHERE reference IS NOT NULL;

-- migrate:down
DROP INDEX adjustment_reference_key;

ALTER TABLE adjustment
  DROP CONSTRAINT adjustment_reference_hash,
  DROP COLUMN request_hash,
  DROP COLUMN reference;
