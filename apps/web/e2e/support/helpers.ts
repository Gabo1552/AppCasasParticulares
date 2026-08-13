import { expect, type Page, type APIRequestContext } from '@playwright/test';

/**
 * Apoyo del recorrido de extremo a extremo.
 *
 * Los códigos de acceso y los enlaces de invitación se obtienen del endpoint de
 * apoyo de la API, no leyendo Mailpit. Parsear un buzón haría la prueba lenta y
 * frágil, y ese endpoint sólo existe con `FEATURE_TEST_SUPPORT_ENDPOINTS`
 * encendido — la API se niega a arrancar si el flag llega encendido en
 * producción.
 */

export const API_URL = process.env['E2E_API_URL'] ?? 'http://localhost:3001';

/** Correo único por corrida: la base es la misma entre ejecuciones. */
export function correoUnico(prefijo: string): string {
  const sufijo = Math.random().toString(36).slice(2, 10);
  return `${prefijo}-${sufijo}@example.test`;
}

/**
 * Sin valor por defecto: un secreto incrustado en el repositorio no es un
 * secreto. Si falta, el E2E falla acá con un mensaje claro en vez de recibir 401
 * en cada llamada y hacer perder el tiempo buscando la causa.
 */
const secret = (() => {
  const value = process.env['TEST_SUPPORT_SECRET'];
  if (value === undefined || value.length === 0) {
    throw new Error(
      'Falta TEST_SUPPORT_SECRET. Los endpoints de apoyo lo exigen: definilo con el mismo ' +
        'valor con el que arrancó la API.',
    );
  }
  return value;
})();

export async function ultimoCodigo(request: APIRequestContext, email: string): Promise<string> {
  for (let attempt = 0; attempt < 15; attempt++) {
    const respuesta = await request.get(`${API_URL}/api/v1/test-support/last-access-code`, {
      params: { email },
      headers: { 'x-test-support-secret': secret },
    });
    if (respuesta.ok()) {
      return ((await respuesta.json()) as { code: string }).code;
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  const respuesta = await request.get(`${API_URL}/api/v1/test-support/last-access-code`, {
    params: { email },
    headers: { 'x-test-support-secret': secret },
  });
  expect(respuesta.ok(), `No se pudo obtener el código de ${email}`).toBeTruthy();
  return ((await respuesta.json()) as { code: string }).code;
}

export async function tokenInvitacion(request: APIRequestContext, email: string): Promise<string> {
  for (let attempt = 0; attempt < 15; attempt++) {
    const respuesta = await request.get(`${API_URL}/api/v1/test-support/invitation-token`, {
      params: { email },
      headers: { 'x-test-support-secret': secret },
    });
    if (respuesta.ok()) {
      return ((await respuesta.json()) as { token: string }).token;
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  const respuesta = await request.get(`${API_URL}/api/v1/test-support/invitation-token`, {
    params: { email },
    headers: { 'x-test-support-secret': secret },
  });
  expect(respuesta.ok(), `No se pudo obtener la invitación de ${email}`).toBeTruthy();
  return ((await respuesta.json()) as { token: string }).token;
}

/** Recorre la pantalla de ingreso: pedir el código y escribirlo. */
export async function ingresar(page: Page, email: string): Promise<void> {
  await page.goto('/ingresar');
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByRole('button', { name: 'Enviarme el código' }).click();

  await expect(page.getByLabel('Código de 6 dígitos')).toBeVisible();

  const codigo = await ultimoCodigo(page.request, email);
  await page.getByLabel('Código de 6 dígitos').fill(codigo);
  await page.getByRole('button', { name: 'Ingresar' }).click();

  await expect(page).not.toHaveURL(/\/ingresar/);
}

/** Completa el formulario de perfil, que es igual para los dos roles. */
export async function crearPerfil(
  page: Page,
  datos: { nombre: string; apellido: string; telefono: string },
): Promise<void> {
  await page.getByLabel('Nombre', { exact: true }).fill(datos.nombre);
  await page.getByLabel('Apellido').fill(datos.apellido);
  await page.getByLabel('Teléfono').fill(datos.telefono);
  await page.getByLabel(/Acepto los términos/).check();
  await page.getByLabel(/Acepto la política/).check();
  await page.getByRole('button', { name: 'Crear mi perfil' }).click();
  await expect(page).not.toHaveURL(/\/onboarding\/(familia|trabajadora)/);
}

export const DOMICILIO = {
  alias: 'Casa de Palermo',
  calle: 'Av. Santa Fe',
  numero: '3200',
  localidad: 'CABA',
  codigoPostal: 'C1425',
};

/** Carga el formulario de domicilio y lo guarda. */
export async function cargarDomicilio(page: Page): Promise<void> {
  await page.getByLabel('Alias del domicilio').fill(DOMICILIO.alias);
  await page.getByLabel('Calle').fill(DOMICILIO.calle);
  await page.getByLabel('Número').fill(DOMICILIO.numero);
  await page.getByLabel('Localidad').fill(DOMICILIO.localidad);
  await page.getByLabel('Código postal').fill(DOMICILIO.codigoPostal);
  await page.getByRole('button', { name: 'Guardar domicilio' }).click();
  await expect(page).not.toHaveURL(/\/domicilios\/nuevo/);
}

/** Carga las condiciones acordadas en la pantalla de la relación. */
export async function cargarCondiciones(page: Page): Promise<void> {
  await page.getByLabel('Fecha prevista de inicio').fill('2026-09-01');
  await page.getByLabel('Categoría de tareas').selectOption('TAREAS_GENERALES');
  await page.getByLabel('Modalidad').selectOption('WITH_WITHDRAWAL');
  await page.getByLabel('Forma de la remuneración').selectOption('MONTHLY');
  await page.getByLabel('Remuneración mensual acordada (ARS)').fill('350000.00');
  await page.getByLabel('Horas semanales estimadas').fill('18');
  await page.getByLabel('Día de pago habitual (opcional)').fill('5');
  await page.getByRole('button', { name: 'Guardar condiciones' }).click();
  await expect(page.getByText('Guardamos las condiciones.')).toBeVisible();
}

/** Carga el horario semanal. */
export async function cargarHorario(page: Page): Promise<void> {
  for (const dia of ['lunes', 'miércoles', 'viernes']) {
    await page.getByLabel(`Trabaja el ${dia}`).check();
    await page.getByLabel(`Entrada del ${dia}`).fill('09:00');
    await page.getByLabel(`Salida del ${dia}`).fill('15:00');
    await page.getByLabel(`Pausa del ${dia} en minutos`).fill('30');
  }
  await page.getByRole('button', { name: 'Guardar horario' }).click();
  await expect(page.getByText('Guardamos el horario semanal.')).toBeVisible();
}

/**
 * Inyecta una jornada aprobada histórica a través de test-support.
 *
 * Usa `fetch` nativo en vez de la `APIRequestContext` de Playwright para que no
 * se hereden las cookies de sesión del navegador — la cookie `casas_csrf`
 * dispararía el guard CSRF al enviar un POST sin la cabecera correspondiente.
 */
export async function crearJornadaAprobadaHistorica(
  _request: APIRequestContext,
  relationshipId: string,
  dateStr: string,
  minutes: number = 480,
): Promise<string> {
  const respuesta = await fetch(`${API_URL}/api/v1/test-support/seed-approved-workday`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-test-support-secret': secret,
    },
    body: JSON.stringify({ relationshipId, date: dateStr, minutes }),
  });
  const body = await respuesta.text();
  expect(respuesta.ok, `No se pudo crear la jornada aprobada histórica: ${body}`).toBeTruthy();
  return (JSON.parse(body) as { workDayId: string }).workDayId;
}
