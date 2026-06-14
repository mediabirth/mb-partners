-- Add 'cooperation' value to deal_channel enum
-- Required for the new cooperation submission flow in refer/actions.ts
ALTER TYPE deal_channel ADD VALUE IF NOT EXISTS 'cooperation';
