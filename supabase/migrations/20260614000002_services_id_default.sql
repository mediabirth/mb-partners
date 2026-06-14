-- services.id is text (not uuid), so set a text-compatible default
ALTER TABLE services
  ALTER COLUMN id SET DEFAULT gen_random_uuid()::text;
