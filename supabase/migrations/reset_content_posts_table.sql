-- Complete reset and fix for content_posts table
-- Run this in Supabase SQL Editor

-- First check what tables exist
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public';

-- Check if content_posts exists
SELECT EXISTS (
   SELECT FROM information_schema.tables 
   WHERE table_schema = 'public'
   AND table_name = 'content_posts'
);

-- If table doesn't exist, create it
CREATE TABLE IF NOT EXISTS public.content_posts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    brief TEXT,
    caption TEXT,
    captions JSONB,
    content_type TEXT NOT NULL,
    platforms TEXT[] NOT NULL,
    status TEXT NOT NULL DEFAULT 'idea',
    scheduled_for TIMESTAMPTZ,
    posted_at TIMESTAMPTZ,
    content_pillar TEXT NOT NULL,
    hashtags TEXT,
    first_comment TEXT,
    media_urls TEXT[],
    asset_url TEXT,
    notes TEXT,
    reach INTEGER DEFAULT 0,
    engagement INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    buffer_post_ids JSONB DEFAULT '{}'::jsonb
);

-- Enable RLS if not already enabled
ALTER TABLE public.content_posts ENABLE ROW LEVEL SECURITY;

-- Create RLS policy if not exists
DROP POLICY IF EXISTS "Enable all for authenticated users" ON public.content_posts;
CREATE POLICY "Enable all for authenticated users" ON public.content_posts
    FOR ALL USING (auth.role() = 'authenticated');

-- Force schema cache refresh (run this separately if needed)
NOTIFY pgrst, 'reload schema';

-- Verify columns now exist
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'content_posts'
ORDER BY ordinal_position;
