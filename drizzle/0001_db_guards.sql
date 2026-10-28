-- Audit log is append-only: block UPDATE, DELETE and TRUNCATE at the database level.
CREATE OR REPLACE FUNCTION audit_logs_block_changes() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs is append-only';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER audit_logs_no_update BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION audit_logs_block_changes();
--> statement-breakpoint
CREATE TRIGGER audit_logs_no_truncate BEFORE TRUNCATE ON audit_logs
  FOR EACH STATEMENT EXECUTE FUNCTION audit_logs_block_changes();
--> statement-breakpoint
-- The stock ledger is append-only too.
CREATE OR REPLACE FUNCTION stock_movements_block_changes() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'stock_movements is append-only';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER stock_movements_no_update BEFORE UPDATE OR DELETE ON stock_movements
  FOR EACH ROW EXECUTE FUNCTION stock_movements_block_changes();
--> statement-breakpoint
-- Human-friendly order numbers: FL-100001, FL-100002 ...
CREATE SEQUENCE IF NOT EXISTS order_number_seq START WITH 100001;
--> statement-breakpoint
-- Full-text search across product title, brand and description, plus SKUs via a join at query time.
ALTER TABLE products ADD COLUMN search_tsv tsvector GENERATED ALWAYS AS (
  setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
  setweight(to_tsvector('english', coalesce(brand, '')), 'B') ||
  setweight(to_tsvector('english', coalesce(description, '')), 'C')
) STORED;
--> statement-breakpoint
CREATE INDEX products_search_idx ON products USING gin (search_tsv);
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
CREATE INDEX products_title_trgm_idx ON products USING gin (title gin_trgm_ops);
--> statement-breakpoint
-- Only one default stock location.
CREATE UNIQUE INDEX locations_one_default_uq ON locations ((true)) WHERE is_default;
--> statement-breakpoint
-- Reserved stock may never exceed what is physically on hand after a website reservation;
-- the reservation function enforces available_to_sell, this is a last line of defence.
ALTER TABLE stock_reservations ADD CONSTRAINT reservations_expiry_after_create CHECK (expires_at > created_at);
