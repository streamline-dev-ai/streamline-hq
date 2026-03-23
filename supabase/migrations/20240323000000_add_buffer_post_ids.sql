-- Add buffer_post_ids column to content_posts table
-- This stores the Buffer post IDs for each platform when posts are scheduled via Buffer

ALTER TABLE content_posts 
ADD COLUMN IF NOT EXISTS buffer_post_ids JSONB DEFAULT '{}'::jsonb;

-- Create index for faster queries on posts with Buffer IDs
CREATE INDEX IF NOT EXISTS idx_content_posts_buffer_post_ids 
ON content_posts USING GIN (buffer_post_ids);