-- Add ref_base / ft_basis / sort to service_menus
ALTER TABLE service_menus
  ADD COLUMN IF NOT EXISTS ref_base TEXT;

ALTER TABLE service_menus
  ADD COLUMN IF NOT EXISTS ft_basis TEXT;

-- Ensure sort column exists (was in original schema but confirm)
ALTER TABLE service_menus
  ADD COLUMN IF NOT EXISTS sort INT4 DEFAULT 0 NOT NULL;
