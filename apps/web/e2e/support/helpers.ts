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

export async function ultimoCodigo(request: APIRequestContext, email: string): Promise<string> {
  const respuesta = await request.get(`${API_URL}/api/v1/test-support/last-access-code`, {
    params: { email },
  });
  expect(respuesta.ok(), `No se pudo obtener el código de ${email}`).toBeTruthy();
  return ((await respuesta.json()) as { code: string }).code;
}

export async function tokenInvitacion(request: APIRequestContext, email: string): Promise<string> {
  const respuesta = await request.get(`${API_URL}/api/v1/test-support/invitation-token`, {
    params: { email },
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
}
