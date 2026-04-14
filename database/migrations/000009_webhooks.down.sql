-- Migration 000009 DOWN: Drop webhook tables and partitions

DROP TRIGGER IF EXISTS trg_webhook_endpoints_updated_at ON webhook_endpoints;

-- Drop partitions (they are dropped automatically with parent, but being explicit)
DROP TABLE IF EXISTS webhook_deliveries_default;
DROP TABLE IF EXISTS webhook_deliveries_2026_06;
DROP TABLE IF EXISTS webhook_deliveries_2026_05;
DROP TABLE IF EXISTS webhook_deliveries_2026_04;
DROP TABLE IF EXISTS webhook_deliveries_2026_03;
DROP TABLE IF EXISTS webhook_deliveries_2026_02;
DROP TABLE IF EXISTS webhook_deliveries_2026_01;
DROP TABLE IF EXISTS webhook_deliveries;
DROP TABLE IF EXISTS webhook_endpoints;
