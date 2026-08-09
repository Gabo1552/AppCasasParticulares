# ADR 0003 — Seguridad del OTP en el Transactional Outbox

- **Estado**: Aceptada
- **Fecha**: 2026-08-07 · revisada 2026-08-09
- **Decide**: equipo técnico
- **Contexto**: Etapa 3, endurecimiento de notificaciones y transactional outbox
- **Modifica**: la persistencia de notificaciones de autenticación en `outbox_message`

## Problema

Al migrar el envío de notificaciones al patrón Transactional Outbox, el código de acceso de un solo
uso (OTP) queda escrito en una fila de `outbox_message` hasta que el worker lo despacha. En claro,
cualquiera con acceso a la base o a un backup podría ingresar como esa persona.

La revisión del PR #22 encontró que la primera implementación resolvía ese problema pero introducía
otros tres, todos en el mismo archivo:

1. El payload se sanitizaba en **cada** fallo de SMTP, no sólo al terminar. El reintento se quedaba
   sin ciphertext y no tenía qué enviar: había retry, pero no podía reintentar.
2. El claim del lote era `findMany` → `sendMail` → `update`, protegido por un booleano en memoria.
   Con dos instancias, ambas seleccionaban la misma fila y el correo salía dos veces.
3. El payload declaraba un `keyId` que el descifrado descartaba: siempre usaba la misma clave. No
   era rotación, era la apariencia de rotación.

## Decisión

### 1. Cifrado en reposo con keyring real

El OTP se cifra con `AES-256-GCM`, IV aleatorio de 12 bytes y tag de autenticación. El payload es
`<keyId>:<iv>:<tag>:<ciphertext>`, todo en base64, y el descifrado **resuelve la clave por el
`keyId` del propio payload** contra un keyring.

El keyring se configura con dos variables:

```
FIELD_ENCRYPTION_KEYS="v1:<base64>,v2:<base64>"
FIELD_ENCRYPTION_ACTIVE_KEY_ID="v2"
```

Cada clave debe decodificar a **exactamente** 32 bytes. Si alguna no cumple, `loadAppConfig` lanza y
la aplicación no arranca. Se descarta explícitamente el relleno del tipo `secret.padEnd(32, '0')`:
convierte una clave débil o mal configurada en una que parece válida, que es el error que más caro
sale y el más difícil de notar.

Para rotar: se agrega la clave nueva, se mueve `ACTIVE_KEY_ID`, y la anterior se conserva mientras
queden payloads cifrados con ella. Retirarla antes vuelve ilegible lo que cifró, y el error lo dice
con ese nombre.

### 2. Descifrado sólo en el despacho

El worker descifra en memoria al construir el mensaje SMTP. En ningún otro punto del sistema el OTP
existe en claro fuera del proceso que lo generó.

### 3. Sanitización sólo en estado terminal

Mientras el mensaje sea reintentable, el payload **no se toca**. El ciphertext se retira en dos
momentos, y sólo en esos dos:

- **Entrega exitosa** (`DELIVERED`): el correo salió, el OTP ya no hace falta.
- **Dead-letter** (`DEAD_LETTER`): se agotaron los cinco intentos.

Se elimina la clave `encryptedOtp` en vez de reemplazarla por una máscara, y se deja
`otpRedactedAt`. Un `'******'` donde se espera un ciphertext hace creer a quien lo lea que hay algo
que descifrar. El destinatario y el resto del payload se conservan para auditoría.

El `lastError` se recorta y se le quitan las secuencias de cuatro o más dígitos cuando el mensaje es
un OTP: algunos servidores SMTP devuelven parte del mensaje rechazado dentro del error, y ese
mensaje contiene el código.

### 4. Claim con lease, seguro entre instancias

El worker toma su lote dentro de una transacción corta con `FOR UPDATE SKIP LOCKED`, marca las filas
como `PROCESSING` con `processingBy`, `processingStartedAt` y `leaseExpiresAt`, y cierra la
transacción. **SMTP nunca ocurre dentro de una transacción.**

Son elegibles los `PENDING` cuya espera venció y los `PROCESSING` cuyo lease expiró — estos últimos
son los que quedaron colgados porque la instancia que los tenía murió. El lease dura 60 segundos,
holgadamente más que el timeout de SMTP: si venciera durante un envío en curso, otra instancia
tomaría el mismo mensaje y el correo saldría dos veces.

El estado pasa a ser una columna (`PENDING`, `PROCESSING`, `DELIVERED`, `DEAD_LETTER`) en lugar de
deducirse de `processedAt` y `attempts`, que no distinguen "lo está procesando otra instancia" de
"espera su próximo intento".

### 5. El encolado es parte de la transacción de negocio

`NotificationsService` exige una `PrismaTx` en todos sus métodos y no tiene alternativa. El mensaje
del outbox persiste en la misma transacción que el cambio de negocio y su evento de auditoría: o
persisten los tres, o no persiste ninguno.

Antes las notificaciones se emitían después de cerrar la transacción, que es precisamente lo que el
patrón outbox existe para impedir: un corte entre el commit y el encolado hacía desaparecer la
notificación sin dejar rastro.

## Consecuencias

**Positivas**

- Ningún OTP legible en `outbox_message` ni en los backups.
- El reintento funciona de verdad: el segundo intento descifra y envía el mismo código.
- Dos o más instancias del worker pueden convivir sin duplicar correos, y una instancia que muere no
  bloquea sus mensajes para siempre.
- La rotación de claves es real y verificable: un payload cifrado con `v1` se sigue leyendo después
  de rotar a `v2`.
- Una clave mal configurada impide el arranque en vez de degradar el cifrado en silencio.

**Costos aceptados**

- Costo computacional de AES-256-GCM por notificación OTP.
- Una transacción corta extra por lote para el claim.
- La rotación exige conservar las claves viejas mientras queden payloads suyos. No hay borrado
  automático: retirar una clave es una decisión con consecuencias y se toma a mano.

## Verificación

- `apps/api/src/common/crypto/__tests__/field-encryption.test.ts` — rotación, `keyId` desconocido,
  largo de clave inválido, auth tag corrupto, arranque.
- `apps/api/src/modules/notifications/__tests__/outbox.test.ts` — el reintento conserva el
  ciphertext, el éxito y el dead-letter lo retiran, el error no filtra el código.
- `apps/api/src/modules/notifications/__tests__/outbox-claim.integration.test.ts` — dos workers
  concurrentes contra PostgreSQL real, lease vigente y lease vencido.
