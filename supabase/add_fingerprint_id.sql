-- Migration: add fingerprint_id column to students table
-- This column stores the unique fingerprint template ID captured by the local bridge daemon.
-- It is nullable — students without a registered fingerprint are simply excluded from
-- automatic matching during Fingerprint Blitz attendance sessions.

ALTER TABLE students
  ADD COLUMN IF NOT EXISTS fingerprint_id text;
