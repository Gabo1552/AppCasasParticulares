-- E3.7-E3.8: Asistencia, fichajes, correcciones y minutos aprobados.

-- ─── Jornadas (WorkDay) ───────────────────────────────────────────────────────

ALTER TABLE "work_day"
    ADD COLUMN "approvedMinutes" INTEGER;

CREATE INDEX "work_day_employmentRelationshipId_status_idx"
    ON "work_day"("employmentRelationshipId", "status");

-- ─── Correcciones de asistencia (AttendanceCorrection) ────────────────────────

ALTER TABLE "attendance_correction"
    ADD COLUMN "workDayId" UUID,
    ADD COLUMN "originalClockInAt" TIMESTAMP(3),
    ADD COLUMN "originalClockOutAt" TIMESTAMP(3),
    ADD COLUMN "proposedClockInAt" TIMESTAMP(3),
    ADD COLUMN "proposedClockOutAt" TIMESTAMP(3),
    ALTER COLUMN "timeEntryId" DROP NOT NULL,
    ALTER COLUMN "proposedAt" DROP NOT NULL;

CREATE INDEX "attendance_correction_workDayId_status_idx"
    ON "attendance_correction"("workDayId", "status");

ALTER TABLE "attendance_correction"
    ADD CONSTRAINT "attendance_correction_workDayId_fkey"
    FOREIGN KEY ("workDayId") REFERENCES "work_day"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
