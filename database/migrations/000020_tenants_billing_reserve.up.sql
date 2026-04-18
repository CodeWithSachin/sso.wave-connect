-- Migration 000020: Reserve billing columns on tenants
--
-- Phase 0 of the dual-product onboarding plan: billing integration is
-- explicitly out-of-scope for launch, but the shape of the integration
-- column is fixed now so later phases can wire Stripe/Paddle webhooks
-- without a breaking migration. The columns are nullable today; a later
-- migration will add partial unique constraints when billing actually
-- goes live.
--
-- Naming note: `billing_customer_id` rather than `stripe_customer_id` so
-- the column stays meaningful if we change providers. `billing_provider`
-- disambiguates.

ALTER TABLE tenants ADD COLUMN billing_customer_id     VARCHAR(128);
ALTER TABLE tenants ADD COLUMN billing_subscription_id VARCHAR(128);
ALTER TABLE tenants ADD COLUMN billing_provider        VARCHAR(32);

COMMENT ON COLUMN tenants.billing_customer_id IS
    'External billing customer ID (e.g. Stripe cus_*). Reserved by 000020; wired in a later phase.';
COMMENT ON COLUMN tenants.billing_subscription_id IS
    'External subscription ID (e.g. Stripe sub_*). Reserved by 000020; wired in a later phase.';
COMMENT ON COLUMN tenants.billing_provider IS
    'Provider identifier (e.g. stripe, paddle). Reserved by 000020; wired in a later phase.';
