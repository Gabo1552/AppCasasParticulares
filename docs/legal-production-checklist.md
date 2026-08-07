# Checklist de Preparación Legal y Operativa para Producción

Este documento detalla todas las verificaciones legales, operativas y de cumplimiento normativo exigidas antes de promover la aplicación de un piloto controlado a producción abierta.

---

## 1. Términos y Condiciones y Políticas de Privacidad

- [ ] **Revisión por Abogado Laboralista**: Los Términos de Servicio de la plataforma fueron revisados y aprobados por un profesional matriculado en Argentina (especialidad régimen de casas particulares Ley 26.844).
- [ ] **Política de Privacidad (AAIP / Ley 25.326)**: La Política de Privacidad cumple con las exigencias de la Agencia de Acceso a la Información Pública (AAIP) y la Ley de Protección de Datos Personales N.º 25.326.
- [ ] **Registro de Base de Datos**: Las bases de datos de usuarios (familias empleadoras y trabajadoras) están inscriptas ante el Registro Nacional de Bases de Datos de la AAIP.
- [ ] **Estado en Plataforma**: El documento cuenta con estado `APPROVED` en la base de datos de producción (`ConsentDocument.status = 'APPROVED'`). No se permite operar en producción con borradores (`DRAFT` o `UNDER_REVIEW`).

---

## 2. Régimen Laboral de Casas Particulares (Ley 26.844)

- [ ] **Escalas Salariales Actualizadas**: Se verificó la vigencia de las escalas salariales de la Comisión Nacional de Trabajo en Casas Particulares (CNTCP).
- [ ] **Recibos y Modelos**: El modelo de constancia de recepción de condiciones y de liquidación cumple con los datos mínimos requeridos por la Resolución CPTCP y la Ley 26.844.
- [ ] **No suplantación de ARCA (AFIP)**: La plataforma aclara expresamente a las partes que la aceptación de condiciones dentro de la app no reemplaza el alta formal ante la Agencia de Recaudación y Control Aduanero (ARCA) ni el pago de aportes obligatorios.

---

## 3. Seguridad e Identidad

- [ ] **Protección de Secretos**: No hay secretos de desarrollo (`dev-only`), claves de prueba ni flags de `FEATURE_TEST_SUPPORT_ENDPOINTS` encendidos en el entorno de producción.
- [ ] **Revocación de Sesiones**: El registro de revocación de sesiones en Redis está activo y configurado con fail-closed ante caídas de la caché.
- [ ] **Cifrado de Datos Sensibles**: Todos los campos con DNI, CUIT, teléfonos y direcciones están cifrados con AES-256-GCM (`FIELD_ENCRYPTION_KEY`).

---

## 4. Auditoría y Trazabilidad

- [ ] **Evidencia de Aceptación**: Cada relación laboral en estado `ACTIVE` cuenta con un snapshot inmutable en `workerAcceptanceEvidence` (versiones de condiciones, versión de horario, fecha/hora, dirección IP y User-Agent).
- [ ] **Log de Auditoría Inmutable**: La tabla `audit_event` registra la secuencia completa desde la solicitud de OTP hasta la activación de la relación.

---

## 5. Salida de Correos (Transactional Outbox)

- [ ] **Servidor SMTP Comercial**: El servicio de correo está conectado a un proveedor transaccional con reputación SPF, DKIM y DMARC configurada.
- [ ] **Worker de Outbox Activo**: El worker de BullMQ/Outbox procesa de forma continua y monitoreada la cola de notificaciones.
