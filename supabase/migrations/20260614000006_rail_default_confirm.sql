-- Confirm rail column has DEFAULT 'std' (already set; this is a no-op safety migration)
ALTER TABLE services
  ALTER COLUMN rail SET DEFAULT 'std';
