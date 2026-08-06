-- CreateEnum
CREATE TYPE "WorkerInvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'REVOKED', 'EXPIRED');

-- AlterTable
ALTER TABLE "employer" ADD COLUMN     "firstName" TEXT NOT NULL,
ADD COLUMN     "lastName" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "worker" ADD COLUMN     "firstName" TEXT NOT NULL,
ADD COLUMN     "lastName" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "household" DROP COLUMN "addressLine",
ADD COLUMN     "accessInstructions" TEXT,
ADD COLUMN     "apartment" TEXT,
ADD COLUMN     "country" TEXT NOT NULL DEFAULT 'AR',
ADD COLUMN     "floor" TEXT,
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "street" TEXT NOT NULL,
ADD COLUMN     "streetNumber" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "relationship_terms" ADD COLUMN     "adminNotes" TEXT,
ADD COLUMN     "paymentDayOfMonth" INTEGER,
ADD COLUMN     "requiresProfessionalReview" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "worker_invitation" (
    "id" UUID NOT NULL,
    "employerId" UUID NOT NULL,
    "householdId" UUID NOT NULL,
    "workerEmail" TEXT NOT NULL,
    "workerName" TEXT,
    "status" "WorkerInvitationStatus" NOT NULL DEFAULT 'PENDING',
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resentCount" INTEGER NOT NULL DEFAULT 0,
    "lastResentAt" TIMESTAMP(3),
    "respondedAt" TIMESTAMP(3),
    "respondedByUserId" UUID,
    "revokedAt" TIMESTAMP(3),
    "revokedReason" TEXT,
    "employmentRelationshipId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdByUserId" UUID,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "worker_invitation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "worker_invitation_tokenHash_key" ON "worker_invitation"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "worker_invitation_employmentRelationshipId_key" ON "worker_invitation"("employmentRelationshipId");

-- CreateIndex
CREATE INDEX "worker_invitation_employerId_status_idx" ON "worker_invitation"("employerId", "status");

-- CreateIndex
CREATE INDEX "worker_invitation_workerEmail_status_idx" ON "worker_invitation"("workerEmail", "status");

-- AddForeignKey
ALTER TABLE "worker_invitation" ADD CONSTRAINT "worker_invitation_employerId_fkey" FOREIGN KEY ("employerId") REFERENCES "employer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "worker_invitation" ADD CONSTRAINT "worker_invitation_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "household"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "worker_invitation" ADD CONSTRAINT "worker_invitation_employmentRelationshipId_fkey" FOREIGN KEY ("employmentRelationshipId") REFERENCES "employment_relationship"("id") ON DELETE SET NULL ON UPDATE CASCADE;

