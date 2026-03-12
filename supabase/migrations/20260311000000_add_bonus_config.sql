-- Migration: Add bonus_config JSONB column to projects table
-- Purpose: Enable employer-specific bonus/allowance configurations (e.g., DRK Lübeck)

-- Up Migration
ALTER TABLE projects ADD COLUMN IF NOT EXISTS bonus_config JSONB DEFAULT NULL;

-- Add comment for documentation
COMMENT ON COLUMN projects.bonus_config IS 'Employer-specific bonus configuration (allowances, shift premiums, qualifications). See BonusConfig type.';

-- Down Migration (for rollback):
-- ALTER TABLE projects DROP COLUMN IF EXISTS bonus_config;
