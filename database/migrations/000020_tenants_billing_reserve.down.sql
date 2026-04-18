-- Migration 000020 DOWN: Drop the reserved billing columns.

ALTER TABLE tenants DROP COLUMN IF EXISTS billing_provider;
ALTER TABLE tenants DROP COLUMN IF EXISTS billing_subscription_id;
ALTER TABLE tenants DROP COLUMN IF EXISTS billing_customer_id;
