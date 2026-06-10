ALTER TABLE expenses ADD COLUMN IF NOT EXISTS affects_profitability BOOLEAN DEFAULT true;
