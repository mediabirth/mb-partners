-- Add extra columns to services for v9 editor
ALTER TABLE services
  ADD COLUMN IF NOT EXISTS rail TEXT;

ALTER TABLE services
  ADD COLUMN IF NOT EXISTS coverage_steps JSONB;

ALTER TABLE services
  ADD COLUMN IF NOT EXISTS ft_trigger TEXT;

ALTER TABLE services
  ADD COLUMN IF NOT EXISTS ft_condition TEXT;
