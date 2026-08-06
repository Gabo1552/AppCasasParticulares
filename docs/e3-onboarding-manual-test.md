# Prueba manual del recorrido de onboarding (Etapa 3, pasos 1 a 6)

Cómo recorrer a mano lo que las pruebas automatizadas verifican solas. Sirve para revisar el
trabajo, para mostrar el producto y para reproducir un problema que el E2E no haya atrapado.

Toma unos 10 minutos.

---

## 1. Levantar el entorno

```bash
# Servicios (PostgreSQL, Redis, MinIO, Mailpit)
pnpm docker:up

# Esquema y datos de demostración
pnpm db:migrate
pnpm db:seed

# API en :3001 y web en :3000
pnpm dev
```

Verificar antes de seguir:

| Qué                          | Dónde                          | Se espera                 |
| ---------------------------- | ------------------------------ | ------------------------- |
| La API está viva             | <http://localhost:3001/health> | `{"status":"up",…}`       |
| Las dependencias responden   | <http://localhost:3001/ready>  | `{"status":"up",…}`       |
| La documentación de la API   | <http://localhost:3001/docs>   | Swagger con los endpoints |
| El buzón de correo de prueba | <http://localhost:8025>        | Bandeja de Mailpit vacía  |
| La web                       | <http://localhost:3000>        | Portada, sin sesión       |

Los correos **no** salen a internet: van a Mailpit. Si Mailpit no está corriendo, la aplicación
sigue funcionando y deja el fallo en el log — un correo que no sale no puede abortar un alta.

> **Importante**: usá dos navegadores distintos (o una ventana normal y una de incógnito). La
> familia y la trabajadora son dos personas: si compartís la sesión, no estás probando el recorrido
> real.

---

## 2. Paso 1 — La familia se registra

1. Abrí <http://localhost:3000> y tocá **Ingresar o crear mi cuenta**.
2. Escribí un correo cualquiera, por ejemplo `familia@example.test`, y pedí el código.
3. Andá a Mailpit (<http://localhost:8025>) y abrí el correo **«Tu código de ingreso»**.
4. Copiá los 6 dígitos y pegalos en la pantalla.

**Qué mirar**

- El mensaje después de pedir el código no dice si la cuenta existía. Probá con un correo
  inventado: la respuesta es idéntica. Eso es deliberado — impide averiguar quién está registrado.
- En la base, el código **no** está en texto legible:

  ```bash
  psql "$DATABASE_URL" -c "select destination, code_hash, attempts, expires_at from one_time_code order by created_at desc limit 1;"
  ```

  `code_hash` es un HMAC de 64 caracteres. No hay ninguna columna con el código.

- Pedí el código tres veces seguidas y usá el primero: falla. Sólo vale el último.
- Escribí un código equivocado cinco veces: a partir de ahí corta por intentos y hay que pedir uno
  nuevo, aunque después escribas el correcto.

## 3. Paso 2 — Crea su perfil de empleadora

Elegí **Soy la familia empleadora** y completá nombre, apellido, teléfono y zona horaria.

**Qué mirar**

- El formulario **no** pide clave fiscal, CUIL, datos bancarios ni documento. No es que estén
  ocultos: no existen en el formulario ni en el contrato de la API.
- No se puede continuar sin marcar las dos casillas.
- Los enlaces de términos y privacidad abren el texto real, el mismo que queda registrado:

  ```bash
  psql "$DATABASE_URL" -c "select c.purpose, d.version, c.accepted_at from consent c join consent_document d on d.id = c.\"consentDocumentId\" order by c.accepted_at desc limit 2;"
  ```

  Quedan dos filas, cada una apuntando a la versión exacta del texto que se mostró.

- Después de crear el perfil aparece el menú de familia. Antes no estaba: el rol lo otorga el
  perfil, no el alta.

## 4. Paso 3 — Crea el domicilio de trabajo

Cargá alias, calle, número, localidad, provincia y código postal. Piso, departamento e indicaciones
de acceso son opcionales.

**Qué mirar**

- No se pide ubicación ni el navegador pregunta por permisos de geolocalización. Eso llega con el
  fichaje, y sólo durante el fichaje.
- El país no se pregunta: queda fijo en `AR`.
- En **Domicilios**, archivar pide confirmación antes de ejecutar, y archiva sin borrar: la fila
  sigue existiendo con `archivedAt` cargado.

## 5. Paso 4 — Invita a la trabajadora

Cargá el correo de la trabajadora, por ejemplo `trabajadora@example.test`, y enviá la invitación.

**Qué mirar**

- En Mailpit llega **«… te invitó a registrar tu trabajo»** con un enlace `…/invitacion/<token>`.
- En la base sólo está el hash:

  ```bash
  psql "$DATABASE_URL" -c "select worker_email, status, token_hash, expires_at from worker_invitation order by created_at desc limit 1;"
  ```

- **No** se creó ninguna relación laboral:

  ```bash
  psql "$DATABASE_URL" -c "select count(*) from employment_relationship;"
  ```

  Sigue igual que antes de invitar.

- Tocá **Reenviar**: llega un correo nuevo. El enlace anterior deja de servir — abrilo y vas a ver
  «No pudimos abrir esta invitación».
- Tocá **Dar de baja**: pide confirmación. Después, el enlace muestra «Esta invitación fue dada de
  baja» y no ofrece ningún botón para aceptar.

## 6. Paso 5 — La trabajadora acepta la invitación

En el **otro navegador**, abrí el enlace del correo.

**Qué mirar**

- Sin sesión se ve quién invita y a qué domicilio, y nada más: no aparece la dirección exacta ni
  ningún dato de la familia más allá del nombre.
- Ingresá con el correo invitado (el formulario ya viene con ese correo cargado), creá el perfil de
  trabajadora y volvé al enlace.
- Tocá **Aceptar la invitación**. La relación queda en **«Falta configurar»**, no activa: aceptar la
  invitación no es aceptar un sueldo ni un horario, que todavía no existen.
- A la familia le llega **«… aceptó la invitación»**.

**Prueba del control de acceso**: ingresá con un correo distinto del invitado y abrí el mismo
enlace. La aplicación avisa que la invitación fue enviada a otra dirección, y si forzás el pedido
contra la API responde 403. El token identifica la invitación; no autoriza a la persona.

## 7. Paso 6 — La familia configura condiciones y horario

Como familia, entrá a la relación desde el panel.

### Condiciones

Cargá fecha de inicio, categoría, modalidad, forma de remuneración, monto, horas semanales y, si
querés, día de pago y notas.

**Qué mirar**

- Arriba está el aviso, textual:
  «Los parámetros disponibles son datos de prueba y no constituyen una liquidación oficial.»
- El monto se guarda exacto. Probá con `350000.10`:

  ```bash
  psql "$DATABASE_URL" -c "select agreed_remuneration, currency from relationship_terms order by created_at desc limit 1;"
  ```

  Devuelve `350000.1000`, sin ruido binario. Y en la respuesta de la API viaja como texto:

  ```bash
  curl -s http://localhost:3001/api/v1/employment-relationships/<id> -H "Cookie: …" | jq .conditions.agreedRemuneration
  # "350000.10"  ← con comillas: es string, no number
  ```

- La fecha que se muestra es la que cargaste. Probá con el primer día de un mes: tiene que aparecer
  ese día, no el anterior.

### Horario

Marcá los días, poné entrada, salida y pausa.

**Qué mirar**

- El total semanal se actualiza mientras editás.
- Poné una salida anterior a la entrada, o una pausa tan larga como la jornada: no deja guardar y
  explica por qué.
- No se pueden cargar dos bloques para el mismo día: hay una fila por día.
- Desmarcá todos los días e intentá guardar: pide al menos un día.

### Envío

**Qué mirar — esto es lo importante**

- **No hay ningún botón para activar la relación.** Buscalo: no está.
- El único botón es **Enviar a la trabajadora**, y queda deshabilitado hasta que haya condiciones y
  horario cargados.
- Intentá activarla por la API directamente:

  ```bash
  curl -i -X POST http://localhost:3001/api/v1/employment-relationships/<id>/accept -H "Cookie: <sesión de la familia>"
  # 403
  curl -i -X PATCH http://localhost:3001/api/v1/employment-relationships/<id> -d '{"status":"ACTIVE"}'
  # 404 — no existe un endpoint genérico de cambio de estado
  ```

- Después de enviar, cambiá un monto y guardá: la relación vuelve a **«Falta configurar»** y hay que
  enviar de nuevo. La trabajadora acepta lo que ve, no lo que vio antes.

## 8. La trabajadora acepta las condiciones

En el navegador de la trabajadora, entrá a **Mi trabajo → Revisar las condiciones**.

**Qué mirar**

- Ve exactamente lo mismo que la familia: mismo monto, mismo horario, mismo total semanal, mismo
  aviso de datos de prueba.
- **Acepto estas condiciones** → la relación pasa a **Activa**, y recién ahí.
- **No estoy de acuerdo** pide un motivo, se lo manda a la familia y la relación vuelve a
  configuración.
- A la familia le llega **«… aceptó las condiciones»**.

---

## 9. Verificar la auditoría

```bash
psql "$DATABASE_URL" -c "select action, entity_type, occurred_at from audit_event order by occurred_at desc limit 20;"
```

Tienen que estar, como mínimo: `ACCESS_CODE_REQUESTED`, `LOGIN_SUCCEEDED`,
`EMPLOYER_PROFILE_CREATED`, `HOUSEHOLD_CREATED`, `INVITATION_CREATED`, `WORKER_PROFILE_CREATED`,
`INVITATION_ACCEPTED`, `RELATIONSHIP_CREATED`, `RELATIONSHIP_CONDITIONS_UPDATED`,
`WORK_SCHEDULE_CREATED`, `RELATIONSHIP_CONDITIONS_SUBMITTED`, `RELATIONSHIP_CONDITIONS_ACCEPTED` y
`RELATIONSHIP_ACTIVATED`.

Y no tiene que estar ningún código, token ni encabezado `Authorization`:

```bash
psql "$DATABASE_URL" -c "select count(*) from audit_event where after::text ~* '(authorization|refreshtoken|tokenhash|bearer)';"
# 0
```

El historial no se puede tocar, ni siquiera con acceso directo a la base:

```bash
psql "$DATABASE_URL" -c "update audit_event set action = 'OTRA' where id = (select id from audit_event limit 1);"
# ERROR: audit_event es append-only
psql "$DATABASE_URL" -c "delete from audit_event where id = (select id from audit_event limit 1);"
# ERROR: audit_event es append-only
```

---

## 10. Verificar el aislamiento entre familias

Registrá una segunda familia con otro correo y probá abrir un domicilio o una relación de la
primera usando su identificador.

Se espera **404**, no 403: responder «prohibido» confirmaría que ese identificador existe, y con eso
alguien podría ir descubriendo qué hay en la base probando valores.

---

## 11. Correr las pruebas automatizadas

```bash
pnpm test                 # unitarias
pnpm test:integration     # contra PostgreSQL real
pnpm --filter @casas/web run test:e2e   # navegador real, con la API y la web levantadas
```

El E2E obtiene los códigos y los enlaces del endpoint de apoyo `/api/v1/test-support/*`, no leyendo
Mailpit. Ese endpoint sólo existe con `FEATURE_TEST_SUPPORT_ENDPOINTS=true`, y la API **se niega a
arrancar** si ese flag llega encendido con `NODE_ENV=production`.

Para generar las capturas de pantalla de la documentación:

```bash
cd apps/web && pnpm exec playwright test --config playwright.capturas.config.ts
```
