ALTER TABLE expenses ADD COLUMN IF NOT EXISTS cash_session_id UUID REFERENCES cash_sessions(id) ON DELETE SET NULL;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS payment_method_id UUID REFERENCES payment_methods(id) ON DELETE SET NULL;
