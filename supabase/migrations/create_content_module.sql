-- Create content_posts table
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
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create content_ideas table
CREATE TABLE IF NOT EXISTS public.content_ideas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    hook TEXT,
    brief TEXT,
    pillar TEXT NOT NULL,
    content_type TEXT NOT NULL,
    platforms TEXT[] NOT NULL,
    notes TEXT,
    used BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_content_posts_status ON public.content_posts(status);
CREATE INDEX IF NOT EXISTS idx_content_posts_scheduled_for ON public.content_posts(scheduled_for);
CREATE INDEX IF NOT EXISTS idx_content_ideas_pillar ON public.content_ideas(pillar);
CREATE INDEX IF NOT EXISTS idx_content_ideas_content_type ON public.content_ideas(content_type);

-- Enable RLS
ALTER TABLE public.content_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_ideas ENABLE ROW LEVEL SECURITY;

-- Simple RLS policies (adjust as needed for multi-tenant if applicable)
CREATE POLICY "Enable all for authenticated users" ON public.content_posts
    FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Enable all for authenticated users" ON public.content_ideas
    FOR ALL USING (auth.role() = 'authenticated');
