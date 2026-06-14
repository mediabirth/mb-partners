-- Add cooperation reward columns to services table (service-level coop model)
-- NOTE: coverage_steps / ft_trigger / ft_condition already exist on services
--       and are repurposed as 対応範囲 / 成果地点 / 資格条件

ALTER TABLE services
  ADD COLUMN IF NOT EXISTS coop_enabled BOOLEAN DEFAULT false;

ALTER TABLE services
  ADD COLUMN IF NOT EXISTS coop_rate NUMERIC;

ALTER TABLE services
  ADD COLUMN IF NOT EXISTS coop_base TEXT;
