-- Add 'manual' value to deal_source enum
-- Required for the console's manual deal creation (POST /api/console/deals, source='manual')
ALTER TYPE deal_source ADD VALUE IF NOT EXISTS 'manual';
