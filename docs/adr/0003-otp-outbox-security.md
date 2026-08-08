# ADR 0003 — Seguridad del OTP en el Transactional Outbox

- **Estado**: Aceptada
- **Fecha**: 2026-08-07
- **Decide**: equipo técnico
- **Contexto**: Etapa 3, hardening de notificaciones y transactional outbox
- **Modifica**: la persistencia de notificaciones de autenticación en `outbox_message`

## Problema

Al migrar el envío de notificaciones al patrón Transactional Outbox para evitar que fallas de SMTP afecten operaciones de negocio persistidas, surge el riesgo de seguridad de almacenar códigos de acceso de un solo uso (OTP) en texto claro dentro de la tabla `outbox_message`.

Si una tabla o base de datos es inspeccionada o respaldada, tener OTPs legibles en claro comprometería los accesos de las cuentas de usuario.

## Decisión

1. **Cifrado en reposo del payload OTP**: El código de acceso enviado al outbox se cifra a nivel de aplicación usando `AES-256-GCM` con la clave del sistema (`FIELD_ENCRYPTION_KEY`). El payload almacenado en `outbox_message` contiene solo la versión cifrada (`encryptedCodePayload`).
2. **Desencriptación exclusiva durante el despacho**: El worker de notificaciones desencripta el payload únicamente en memoria al momento de construir el mensaje SMTP.
3. **Limpieza/Sanitización post-procesamiento**: Al marcar el mensaje como `DELIVERED` o `DEAD_LETTER`, el worker sanitiza el payload en la base de datos reemplazando el código cifrado por un placeholder irreversible (`code: "******"`).

## Consecuencias

**Positivas**

- Ningún código de ingreso OTP queda legible en texto claro en la tabla `outbox_message` ni en backups de la base de datos.
- El envío por correo sigue siendo completamente asíncrono y resiliente a fallas de infraestructura SMTP.

**Costos aceptados**

- Ligero costo computacional adicional de cifrado/descifrado AES-256-GCM para notificaciones OTP.
