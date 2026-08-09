-- Outbox: estado explícito y claim con lease, y estado legal explícito.
--
-- Dos cambios que comparten la misma idea: un estado que hasta ahora se
-- deducía (de `processedAt` y `attempts` en el outbox, de una subcadena de
-- `version` en los textos legales) pasa a ser una columna con valores cerrados.

-- ─── Outbox ─────────────────────────────────────────────────────────────────

CREATE TYPE "outbox_status" AS ENUM ('PENDING', 'PROCESSING', 'DELIVERED', 'DEAD_LETTER');

ALTER TABLE "outbox_message"
    ADD COLUMN "status" "outbox_status" NOT NULL DEFAULT 'PENDING',
    ADD COLUMN "processingBy" TEXT,
    ADD COLUMN "processingStartedAt" TIMESTAMP(3),
    ADD COLUMN "leaseExpiresAt" TIMESTAMP(3);

-- Backfill de los mensajes que ya existían. El orden importa: primero los
-- entregados, después los que agotaron los intentos.
UPDATE "outbox_message" SET "status" = 'DELIVERED' WHERE "processedAt" IS NOT NULL;
UPDATE "outbox_message" SET "status" = 'DEAD_LETTER'
    WHERE "processedAt" IS NULL AND "attempts" >= 5;

-- Índice del claim: mismo orden de columnas que la consulta con
-- FOR UPDATE SKIP LOCKED del worker.
CREATE INDEX "outbox_message_status_availableAt_idx"
    ON "outbox_message"("status", "availableAt");

-- ─── Textos legales ─────────────────────────────────────────────────────────

CREATE TYPE "consent_document_status" AS ENUM ('DRAFT', 'UNDER_REVIEW', 'APPROVED', 'RETIRED');

ALTER TABLE "consent_document"
    ADD COLUMN "status" "consent_document_status" NOT NULL DEFAULT 'DRAFT',
    ADD COLUMN "approvedAt" TIMESTAMP(3),
    ADD COLUMN "approvedBy" TEXT,
    ADD COLUMN "effectiveFrom" TIMESTAMP(3),
    ADD COLUMN "supersedesDocumentId" UUID;

-- Sin borrado en cascada: un documento legal no desaparece por arrastre
-- (decisión D10). Si el antecesor se fuera, la referencia queda en NULL.
ALTER TABLE "consent_document"
    ADD CONSTRAINT "consent_document_supersedesDocumentId_fkey"
    FOREIGN KEY ("supersedesDocumentId") REFERENCES "consent_document"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- Una aprobación sin responsable ni fecha no es auditable. La base lo impide,
-- no sólo la aplicación.
ALTER TABLE "consent_document"
    ADD CONSTRAINT "consent_document_approved_requires_evidence"
    CHECK (
        "status" <> 'APPROVED'
        OR ("approvedAt" IS NOT NULL AND "approvedBy" IS NOT NULL)
    );

CREATE INDEX "consent_document_kind_status_effectiveFrom_idx"
    ON "consent_document"("kind", "status", "effectiveFrom");
