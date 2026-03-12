-- Migration to add UNIQUE constraints for scraping deduplication

-- 1. Add unique constraint to intelligence_alerts on the 'title' column
ALTER TABLE public.intelligence_alerts
ADD CONSTRAINT intelligence_alerts_title_key UNIQUE (title);

-- 2. Add unique constraint to blog_posts on the 'url' column
ALTER TABLE public.blog_posts
ADD CONSTRAINT blog_posts_url_key UNIQUE (url);
