-- CreateTable
CREATE TABLE "period_attendance_snapshot" (
    "id" UUID NOT NULL,
    "payrollPeriodId" UUID NOT NULL,
    "schemaVersion" TEXT NOT NULL DEFAULT '1.0',
    "approvedDays" INTEGER NOT NULL,
    "approvedMinutes" INTEGER NOT NULL,
    "payload" JSONB NOT NULL,
    "hash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByUserId" UUID,

    CONSTRAINT "period_attendance_snapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "period_attendance_snapshot_payrollPeriodId_key" ON "period_attendance_snapshot"("payrollPeriodId");

-- CreateIndex
CREATE INDEX "period_attendance_snapshot_hash_idx" ON "period_attendance_snapshot"("hash");

-- AddForeignKey
ALTER TABLE "period_attendance_snapshot" ADD CONSTRAINT "period_attendance_snapshot_payrollPeriodId_fkey" FOREIGN KEY ("payrollPeriodId") REFERENCES "payroll_period"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
