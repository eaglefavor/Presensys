-- Add academic identity columns to profiles table
-- Run this in Supabase Dashboard > SQL Editor

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS faculty TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS department TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS level TEXT;
