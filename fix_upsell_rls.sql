-- Fix RLS policies for upsell_rules table
-- Execute in Supabase SQL Editor
-- This adds missing UPDATE/DELETE restrictions for non-admin users

-- First, check existing policies
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual
FROM pg_policies 
WHERE tablename = 'upsell_rules'
ORDER BY policyname;

-- If there's no policy named "Admins can manage upsell rules", create it
-- Note: This uses DROP POLICY IF EXISTS to avoid errors
DROP POLICY IF EXISTS "Admins can manage upsell rules" ON upsell_rules;
CREATE POLICY "Admins can manage upsell rules"
ON upsell_rules
USING (
  EXISTS (
    SELECT 1 FROM users u
    WHERE u.id = auth.uid()
    AND u.role = 'admin'
    AND u.tenant_id = upsell_rules.tenant_id
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM users u
    WHERE u.id = auth.uid()
    AND u.role = 'admin'
    AND u.tenant_id = upsell_rules.tenant_id
  )
);

-- Verify policies after creation
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual
FROM pg_policies 
WHERE tablename = 'upsell_rules'
ORDER BY policyname;

-- Test: Try to update a rule as anonymous user (should fail)
-- You can test by running:
-- UPDATE upsell_rules SET discount = 999 WHERE id = '530b4e5d-21d7-4782-8893-82e5dcc41bb4';
-- Should get: "new row violates row-level security policy for table "upsell_rules""