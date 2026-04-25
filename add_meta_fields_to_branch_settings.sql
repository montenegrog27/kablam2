-- Add meta tags, favicon, and tracking scripts to branch_settings
ALTER TABLE branch_settings
ADD COLUMN IF NOT EXISTS favicon_url TEXT,
ADD COLUMN IF NOT EXISTS meta_title TEXT,
ADD COLUMN IF NOT EXISTS meta_pixel_script TEXT,
ADD COLUMN IF NOT EXISTS ga4_script TEXT;