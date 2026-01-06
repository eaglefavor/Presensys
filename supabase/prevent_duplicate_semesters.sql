-- Create a unique index to prevent duplicate active semesters with the same name for a user
CREATE UNIQUE INDEX IF NOT EXISTS idx_semesters_user_name_active 
ON semesters (user_id, name) 
WHERE is_deleted = 0;
