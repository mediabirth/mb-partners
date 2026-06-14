-- Add nickname (display name) column to profiles
-- Nullable, no DEFAULT — users set it voluntarily
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS nickname text;
