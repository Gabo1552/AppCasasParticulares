import { test } from '@playwright/test';
import {
  cargarDomicilio,
  correoUnico,
  crearPerfil,
  ingresar,
  tokenInvitacion,
} from './support/helpers';

/**
 * Capturas de las pantallas principales.
 *
 * No verifica nada: existe para documentar el recorrido con imágenes reales de
 * la aplicación corriendo, no con maquetas. Se ejecuta a pedido:
 *
 *   pnpm exec playwright test capturas --grep-invert @nunca
 *
 * Está fuera de la corrida normal (`testIgnore` en la configuración) para no
 * sumar tiempo ni archivos a cada ejecución de CI.
 */
test('capturas del recorrido', async ({ browser }) => {
  test.slow();

  const familiaCtx = await browser.newContext({ viewport: { width: 1100, height: 900 } });
  const trabajadoraCtx = await browser.newContext({ viewport: { width: 1100, height: 900 } });
  const familia = await familiaCtx.newPage();
  const trabajadora = await trabajadoraCtx.newPage();

  const emailFamilia = correoUnico('captura-familia');
  const emailTrabajadora = correoUnico('captura-trabajadora');
  const dir = 'capturas';

  await familia.goto('/');
  await familia.screenshot({ path: `${dir}/01-inicio.png`, fullPage: true });

  await familia.goto('/ingresar');
  await familia.screenshot({ path: `${dir}/02-ingresar.png` });

  await ingresar(familia, emailFamilia);
  await familia.screenshot({ path: `${dir}/03-elegir-perfil.png`, fullPage: true });

  await familia.getByRole('link', { name: 'Crear mi perfil de familia' }).click();
  await familia.screenshot({ path: `${dir}/04-perfil-familia.png`, fullPage: true });

  await crearPerfil(familia, { nombre: 'Ana', apellido: 'Gómez', telefono: '+54 11 5555-1234' });
  await familia.screenshot({ path: `${dir}/05-domicilio.png`, fullPage: true });

  await cargarDomicilio(familia);
  await familia.getByLabel('Correo de la trabajadora').fill(emailTrabajadora);
  await familia.screenshot({ path: `${dir}/06-invitar.png`, fullPage: true });
  await familia.getByRole('button', { name: 'Enviar invitación' }).click();
  await familia.waitForURL(/\/familia\/invitaciones/);
  await familia.screenshot({ path: `${dir}/07-invitaciones.png`, fullPage: true });

  const token = await tokenInvitacion(familia.request, emailTrabajadora);
  await trabajadora.goto(`/invitacion/${token}`);
  await trabajadora.screenshot({ path: `${dir}/08-invitacion-publica.png`, fullPage: true });

  await ingresar(trabajadora, emailTrabajadora);
  await trabajadora.goto('/onboarding/trabajadora');
  await crearPerfil(trabajadora, {
    nombre: 'Rosa',
    apellido: 'Díaz',
    telefono: '+54 11 4444-9876',
  });
  await trabajadora.goto(`/invitacion/${token}`);
  await trabajadora.getByRole('button', { name: 'Aceptar la invitación' }).click();
  await trabajadora.waitForURL(/\/trabajadora\/relaciones\//);

  await familia.goto('/familia');
  await familia.screenshot({ path: `${dir}/09-panel-familia.png`, fullPage: true });
  await familia.getByRole('link', { name: 'Continuar' }).first().click();

  await familia.getByLabel('Fecha prevista de inicio').fill('2026-09-01');
  await familia.getByLabel('Remuneración mensual acordada (ARS)').fill('350000.00');
  await familia.getByLabel('Horas semanales estimadas').fill('18');
  await familia.screenshot({ path: `${dir}/10-condiciones.png`, fullPage: true });
  await familia.getByRole('button', { name: 'Guardar condiciones' }).click();
  await familia.getByText('Guardamos las condiciones.').waitFor();

  for (const dia of ['lunes', 'miércoles', 'viernes']) {
    await familia.getByLabel(`Trabaja el ${dia}`).check();
    await familia.getByLabel(`Entrada del ${dia}`).fill('09:00');
    await familia.getByLabel(`Salida del ${dia}`).fill('15:00');
    await familia.getByLabel(`Pausa del ${dia} en minutos`).fill('30');
  }
  await familia.screenshot({ path: `${dir}/11-horario.png`, fullPage: true });
  await familia.getByRole('button', { name: 'Guardar horario' }).click();
  await familia.getByText('Guardamos el horario semanal.').waitFor();
  await familia.getByRole('button', { name: 'Enviar a la trabajadora' }).click();
  await familia.getByText(/Le enviamos las condiciones/).waitFor();

  await trabajadora.goto('/trabajadora');
  await trabajadora.screenshot({ path: `${dir}/12-panel-trabajadora.png`, fullPage: true });
  await trabajadora.getByRole('link', { name: 'Revisar las condiciones' }).click();
  await trabajadora.screenshot({ path: `${dir}/13-revisar-condiciones.png`, fullPage: true });

  await trabajadora.getByRole('button', { name: 'Acepto estas condiciones' }).click();
  await trabajadora.getByText(/quedó activa/).waitFor();
  await trabajadora.screenshot({ path: `${dir}/14-relacion-activa.png`, fullPage: true });

  // Vista angosta: la trabajadora va a usar la aplicación desde el teléfono.
  const movilCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const movil = await movilCtx.newPage();
  await movil.goto('/');
  await movil.screenshot({ path: `${dir}/15-inicio-movil.png`, fullPage: true });

  await familiaCtx.close();
  await trabajadoraCtx.close();
  await movilCtx.close();
});
