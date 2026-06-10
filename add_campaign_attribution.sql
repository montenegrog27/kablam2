-- Add attribution columns to campaign_deliveries
ALTER TABLE campaign_deliveries ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ;
ALTER TABLE campaign_deliveries ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;
ALTER TABLE campaign_deliveries ADD COLUMN IF NOT EXISTS first_purchase_after_campaign_at TIMESTAMPTZ;
ALTER TABLE campaign_deliveries ADD COLUMN IF NOT EXISTS first_purchase_after_campaign_id UUID;
ALTER TABLE campaign_deliveries ADD COLUMN IF NOT EXISTS first_purchase_after_campaign_amount DECIMAL(12,2);
ALTER TABLE campaign_deliveries ADD COLUMN IF NOT EXISTS days_to_convert INT;
ALTER TABLE campaign_deliveries ADD COLUMN IF NOT EXISTS converted_7d BOOLEAN DEFAULT false;
ALTER TABLE campaign_deliveries ADD COLUMN IF NOT EXISTS converted_30d BOOLEAN DEFAULT false;
ALTER TABLE campaign_deliveries ADD COLUMN IF NOT EXISTS converted_60d BOOLEAN DEFAULT false;
ALTER TABLE campaign_deliveries ADD COLUMN IF NOT EXISTS converted_90d BOOLEAN DEFAULT false;
ALTER TABLE campaign_deliveries ADD COLUMN IF NOT EXISTS conversion_status TEXT DEFAULT 'pending';

-- Campaign metrics (cached)
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS sent_count INT DEFAULT 0;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS failed_count INT DEFAULT 0;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS converted_count INT DEFAULT 0;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS converted_7d_count INT DEFAULT 0;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS converted_30d_count INT DEFAULT 0;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS converted_60d_count INT DEFAULT 0;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS converted_90d_count INT DEFAULT 0;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS revenue_7d DECIMAL(12,2) DEFAULT 0;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS revenue_30d DECIMAL(12,2) DEFAULT 0;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS revenue_60d DECIMAL(12,2) DEFAULT 0;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS revenue_90d DECIMAL(12,2) DEFAULT 0;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS avg_days_to_convert DECIMAL(10,2) DEFAULT 0;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS recovery_rate DECIMAL(5,2) DEFAULT 0;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS paused BOOLEAN DEFAULT false;
