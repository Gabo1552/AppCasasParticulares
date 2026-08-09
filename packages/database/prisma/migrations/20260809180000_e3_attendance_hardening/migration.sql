-- Partial unique index: at most one active (non-CORRECTED) CLOCK_IN per work_day
CREATE UNIQUE INDEX IF NOT EXISTS "time_entry_active_clock_in_per_workday_idx"
ON "time_entry" ("workDayId")
WHERE "kind" = 'CLOCK_IN' AND "status" != 'CORRECTED';

-- Partial unique index: at most one active (non-CORRECTED) CLOCK_OUT per work_day
CREATE UNIQUE INDEX IF NOT EXISTS "time_entry_active_clock_out_per_workday_idx"
ON "time_entry" ("workDayId")
WHERE "kind" = 'CLOCK_OUT' AND "status" != 'CORRECTED';

-- Partial unique index: at most one OPEN work_day per employment_relationship
CREATE UNIQUE INDEX IF NOT EXISTS "work_day_single_open_per_relationship_idx"
ON "work_day" ("employmentRelationshipId")
WHERE "status" = 'OPEN';
