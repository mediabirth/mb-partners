-- Fix tables that were pre-existing with different schemas than the migrations expected.
-- All affected tables are currently empty so no data migration needed.

-- ── broadcasts ───────────────────────────────────────────────────────────────
-- Pre-existing schema was missing: body_images, created_at
-- body was NOT NULL; make it nullable to match API expectations
ALTER TABLE broadcasts
  ADD COLUMN IF NOT EXISTS body_images JSONB,
  ADD COLUMN IF NOT EXISTS created_at  TIMESTAMPTZ DEFAULT now();
ALTER TABLE broadcasts ALTER COLUMN body DROP NOT NULL;

-- ── broadcast_reads ──────────────────────────────────────────────────────────
-- Pre-existing table uses (broadcast_id, partner_id) as composite PK (no id column).
-- Add id column for read-by-id queries.
ALTER TABLE broadcast_reads
  ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid();

-- ── inquiries ────────────────────────────────────────────────────────────────
-- Pre-existing schema was missing: subject, updated_at
ALTER TABLE inquiries
  ADD COLUMN IF NOT EXISTS subject    TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- ── inquiry_messages ─────────────────────────────────────────────────────────
-- Pre-existing schema was missing: sender_role, created_by
ALTER TABLE inquiry_messages
  ADD COLUMN IF NOT EXISTS sender_role TEXT,
  ADD COLUMN IF NOT EXISTS created_by  UUID;
