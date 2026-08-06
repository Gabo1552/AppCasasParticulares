-- Auditoría append-only.
--
-- El encargo exige que los eventos de auditoría sean append-only, y ADM-08 que sean
-- inmutables para usuarios operativos. Una convención en el código no alcanza: basta
-- un `prisma.auditEvent.update()` mal revisado para romperla.
--
-- Esta migración lo hace cumplir en la base: se crea un rol de aplicación con
-- INSERT y SELECT sobre audit_event, y se le revocan UPDATE y DELETE. Un intento
-- de modificar un evento falla con un error de permisos, no con un test que
-- alguien pueda saltear.
--
-- Se agrega además un trigger como segunda barrera, para que la garantía valga
-- también si un despliegue conecta con un rol distinto al previsto.
--
-- Referencias: decisión D9 de docs/adr/0001-initial-architecture.md,
-- INV-AUD-01 de docs/domain-model.md, sección 6 de docs/security-model.md.

-- ── Barrera 1: trigger, independiente del rol que ejecute ───────────────────

CREATE OR REPLACE FUNCTION audit_event_reject_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION
    'audit_event es append-only: % no está permitido. Una corrección se registra como un evento nuevo.',
    TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_event_no_update ON "audit_event";
CREATE TRIGGER audit_event_no_update
  BEFORE UPDATE ON "audit_event"
  FOR EACH ROW EXECUTE FUNCTION audit_event_reject_mutation();

DROP TRIGGER IF EXISTS audit_event_no_delete ON "audit_event";
CREATE TRIGGER audit_event_no_delete
  BEFORE DELETE ON "audit_event"
  FOR EACH ROW EXECUTE FUNCTION audit_event_reject_mutation();

-- ── Barrera 2: permisos del rol de aplicación ──────────────────────────────
--
-- El rol se crea si no existe. La contraseña se asigna fuera de la migración,
-- desde el gestor de secretos: este archivo se versiona y no puede contener
-- credenciales (docs/security-model.md §4).

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'casas_app') THEN
    CREATE ROLE casas_app NOLOGIN;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO casas_app;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO casas_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO casas_app;

-- La excepción: sobre audit_event, sólo leer y escribir eventos nuevos.
REVOKE UPDATE, DELETE, TRUNCATE ON "audit_event" FROM casas_app;
GRANT SELECT, INSERT ON "audit_event" TO casas_app;

-- Y sobre el registro de descargas de documentos, por el mismo motivo.
REVOKE UPDATE, DELETE, TRUNCATE ON "document_access_log" FROM casas_app;
GRANT SELECT, INSERT ON "document_access_log" TO casas_app;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO casas_app;
