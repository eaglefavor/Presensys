-- 1. Add CHECK constraint for date logic
ALTER TABLE semesters DROP CONSTRAINT IF EXISTS check_semester_dates;
ALTER TABLE semesters ADD CONSTRAINT check_semester_dates CHECK (end_date >= start_date);

-- 2. Create Trigger Function to enforce single active semester per user
CREATE OR REPLACE FUNCTION enforce_single_active_semester()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.is_active = true THEN
        UPDATE semesters
        SET is_active = false
        WHERE user_id = NEW.user_id
          AND id != NEW.id
          AND is_active = true;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. Create Trigger (Drop if exists first)
DROP TRIGGER IF EXISTS trg_enforce_single_active_semester ON semesters;
CREATE TRIGGER trg_enforce_single_active_semester
BEFORE INSERT OR UPDATE ON semesters
FOR EACH ROW
EXECUTE FUNCTION enforce_single_active_semester();

-- 4. Clean up existing data: Update semester names to {Session} {Term} Semester format
-- Extract year, e.g. '2023' or '2023/2024'
-- First term
UPDATE semesters
SET name = SUBSTRING(name FROM '20\d{2}/20\d{2}') || ' First Semester'
WHERE name ILIKE '%First%' AND name ~ '20\d{2}/20\d{2}' AND name NOT ILIKE '%First Semester%';

UPDATE semesters
SET name = SUBSTRING(name FROM '20\d{2}') || '/' || (SUBSTRING(name FROM '20\d{2}')::int + 1)::text || ' First Semester'
WHERE (name ILIKE '%First%' OR name ILIKE '%1st%') AND name NOT ~ '20\d{2}/20\d{2}' AND name ~ '20\d{2}';

-- Second term
UPDATE semesters
SET name = SUBSTRING(name FROM '20\d{2}/20\d{2}') || ' Second Semester'
WHERE name ILIKE '%Second%' AND name ~ '20\d{2}/20\d{2}' AND name NOT ILIKE '%Second Semester%';

UPDATE semesters
SET name = SUBSTRING(name FROM '20\d{2}') || '/' || (SUBSTRING(name FROM '20\d{2}')::int + 1)::text || ' Second Semester'
WHERE (name ILIKE '%Second%' OR name ILIKE '%2nd%') AND name NOT ~ '20\d{2}/20\d{2}' AND name ~ '20\d{2}';

-- 5. Address duplicates that might violate the idx_semesters_user_name_active index
-- If updating the names caused duplicates for a user, we'll mark the older ones as deleted.
WITH duplicate_semesters AS (
    SELECT id,
           ROW_NUMBER() OVER (PARTITION BY user_id, name ORDER BY created_at DESC) as rnum
    FROM semesters
    WHERE is_deleted = 0
)
UPDATE semesters
SET is_deleted = 1
WHERE id IN (
    SELECT id FROM duplicate_semesters WHERE rnum > 1
);

-- Re-apply the unique index just to be sure it's intact
CREATE UNIQUE INDEX IF NOT EXISTS idx_semesters_user_name_active
ON semesters (user_id, name)
WHERE is_deleted = 0;
