-- The pre-existing inquiry_status enum only has 'open' and 'resolved'.
-- Add 'replied' and 'closed' values needed by the application.
ALTER TYPE inquiry_status ADD VALUE IF NOT EXISTS 'replied';
ALTER TYPE inquiry_status ADD VALUE IF NOT EXISTS 'closed';
