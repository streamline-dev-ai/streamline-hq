-- Refresh Supabase schema cache and add buffer_post_ids column
-- Run this in Supabase SQL Editor to fix the schema cache issue

-- Refresh the PostgREST schema cache
NOTIFY pgrst, 'reload schema';

-- Add buffer_post_ids column if it doesn't exist
ALTER TABLE content_posts ADD COLUMN IF NOT EXISTS buffer_post_ids JSONB DEFAULT '{}'::jsonb;

-- Verify the table structure
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'content_posts';
