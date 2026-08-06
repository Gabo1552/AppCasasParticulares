import { expect, test, type Browser, type Page } from '@playwright/test';
import {
  DOMICILIO,
  cargarDomicilio,
  correoUnico,
  crearPerfil,
  ingresar,
  tokenInvitacion,
} from './support/helpers';

/**
 * Recorrido completo, de la familia y de la trabajadora, en un navegador real.
 *
 * Dos contextos independientes: cada persona tiene sus propias cookies, igual que
 * si usaran computadoras distintas. Compartir contexto haría pasar la prueba aun
 * si la aplicación confundiera las sesiones.
 */

interface Persona {
  page: Page;
  email: string;
  cerrar: () => Promise<void>;
}

async function abrirPersona(browser: Browser, prefijo: string): Promise<Persona> {
  const context = await browser.newContext();
  const page = await context.newPage();
  return {
    page,
    email: correoUnico(prefijo),
    cerrar: () => context.close(),
  };
}

test.describe('Onboarding de una relación laboral', () => {
  test('la familia configura y la trabajadora acepta', async ({ browser }) => {
    const familia = await abrirPersona(browser, 'familia');
    const trabajadora = await abrirPersona(browser, 'trabajadora');

    try {
      // ── 1. La familia se registra ──────────────────────────────────────────
      await test.step('1. La familia ingresa con un código enviado por correo', async () => {
        await ingresar(familia.page, familia.email);
        await expect(familia.page.getByRole('heading', { name: /Cómo vas a usar/ })).toBeVisible();
      });

      // ── 2. Crea su perfil de empleadora ────────────────────────────────────
      await test.step('2. Crea su perfil de familia empleadora', async () => {
        await familia.page.getByRole('link', { name: 'Crear mi perfil de familia' }).click();
        await crearPerfil(familia.page, {
          nombre: 'Ana',
          apellido: 'Gómez',
          telefono: '+54 11 5555-1234',
        });
        await expect(familia.page).toHaveURL(/\/familia\/domicilios\/nuevo/);
      });

      // ── 3. Crea el domicilio de trabajo ────────────────────────────────────
      await test.step('3. Carga el domicilio donde se trabaja', async () => {
        await cargarDomicilio(familia.page);
        await expect(familia.page).toHaveURL(/\/familia\/invitaciones\/nueva/);
      });

      await test.step('El domicilio queda listado entre los suyos', async () => {
        await familia.page.goto('/familia/domicilios');
        await expect(familia.page.getByRole('heading', { name: DOMICILIO.alias })).toBeVisible();
      });

      // ── 4. Invita a la trabajadora ─────────────────────────────────────────
      await test.step('4. Invita a la trabajadora por correo', async () => {
        await familia.page.goto('/familia/invitaciones/nueva');
        await familia.page.getByLabel('Correo de la trabajadora').fill(trabajadora.email);
        await familia.page.getByRole('button', { name: 'Enviar invitación' }).click();

        await expect(familia.page).toHaveURL(/\/familia\/invitaciones/);
        await expect(familia.page.getByText('Enviamos la invitación por correo.')).toBeVisible();
        await expect(familia.page.getByText('Pendiente')).toBeVisible();
      });

      // ── 5. La trabajadora ingresa y acepta la invitación ───────────────────
      const token = await tokenInvitacion(familia.page.request, trabajadora.email);

      await test.step('5. La trabajadora abre el enlace y ve quién la invitó', async () => {
        await trabajadora.page.goto(`/invitacion/${token}`);
        await expect(
          trabajadora.page.getByRole('heading', { name: /Te invitaron a registrar tu trabajo/ }),
        ).toBeVisible();
        await expect(trabajadora.page.getByText('Ana Gómez')).toBeVisible();
        await expect(trabajadora.page.getByText(DOMICILIO.alias)).toBeVisible();
      });

      await test.step('Ingresa con el correo al que llegó la invitación', async () => {
        await trabajadora.page.getByRole('link', { name: /Ingresar con/ }).click();
        await expect(trabajadora.page.getByLabel('Correo electrónico')).toHaveValue(
          trabajadora.email,
        );
        await ingresar(trabajadora.page, trabajadora.email);
      });

      await test.step('Crea su perfil de trabajadora', async () => {
        await trabajadora.page
          .getByRole('link', { name: 'Crear mi perfil de trabajadora' })
          .first()
          .click();
        await crearPerfil(trabajadora.page, {
          nombre: 'Rosa',
          apellido: 'Díaz',
          telefono: '+54 11 4444-9876',
        });
      });

      await test.step('Acepta la invitación, que no activa nada por sí sola', async () => {
        await trabajadora.page.goto(`/invitacion/${token}`);
        await trabajadora.page.getByRole('button', { name: 'Aceptar la invitación' }).click();

        await expect(trabajadora.page).toHaveURL(/\/trabajadora\/relaciones\//);
        await expect(
          trabajadora.page.getByText(/La familia todavía está cargando las condiciones/),
        ).toBeVisible();
        // Aceptar la invitación no acepta condiciones: no hay ninguna todavía.
        await expect(trabajadora.page.getByText('Falta configurar')).toBeVisible();
      });

      // ── 6. La familia configura condiciones y horario ──────────────────────
      await test.step('6. La familia abre la relación desde su panel', async () => {
        await familia.page.goto('/familia');
        await expect(familia.page.getByText('Rosa Díaz')).toBeVisible();
        await familia.page.getByRole('link', { name: 'Continuar' }).first().click();
        await expect(familia.page).toHaveURL(/\/familia\/relaciones\//);
      });

      await test.step('Ve el aviso de que los parámetros son datos de prueba', async () => {
        await expect(
          familia.page
            .getByText(
              'Los parámetros disponibles son datos de prueba y no constituyen una liquidación oficial.',
            )
            .first(),
        ).toBeVisible();
      });

      await test.step('Carga las condiciones acordadas', async () => {
        await familia.page.getByLabel('Fecha prevista de inicio').fill('2026-09-01');
        await familia.page.getByLabel('Categoría de tareas').selectOption('TAREAS_GENERALES');
        await familia.page.getByLabel('Modalidad').selectOption('WITH_WITHDRAWAL');
        await familia.page.getByLabel('Forma de la remuneración').selectOption('MONTHLY');
        await familia.page.getByLabel('Remuneración mensual acordada (ARS)').fill('350000.00');
        await familia.page.getByLabel('Horas semanales estimadas').fill('18');
        await familia.page.getByLabel('Día de pago habitual (opcional)').fill('5');
        await familia.page.getByRole('button', { name: 'Guardar condiciones' }).click();

        await expect(familia.page.getByText('Guardamos las condiciones.')).toBeVisible();
      });

      await test.step('Carga el horario semanal y ve el total', async () => {
        for (const dia of ['lunes', 'miércoles', 'viernes']) {
          await familia.page.getByLabel(`Trabaja el ${dia}`).check();
          await familia.page.getByLabel(`Entrada del ${dia}`).fill('09:00');
          await familia.page.getByLabel(`Salida del ${dia}`).fill('15:00');
          await familia.page.getByLabel(`Pausa del ${dia} en minutos`).fill('30');
        }

        // (6 h − 30 min) × 3 días = 16 h 30 min.
        await expect(familia.page.getByTestId('total-semanal').first()).toHaveText('16 h 30 min');

        await familia.page.getByRole('button', { name: 'Guardar horario' }).click();
        await expect(familia.page.getByText('Guardamos el horario semanal.')).toBeVisible();
      });

      await test.step('La familia NO tiene forma de activar la relación', async () => {
        await expect(familia.page.getByRole('button', { name: /Activar/ })).toHaveCount(0);
        await expect(familia.page.getByRole('button', { name: /Aceptar/ })).toHaveCount(0);
      });

      await test.step('Envía las condiciones a la trabajadora', async () => {
        await familia.page.getByRole('button', { name: 'Enviar a la trabajadora' }).click();
        await expect(
          familia.page.getByText(
            'Le enviamos las condiciones a la trabajadora para que las revise.',
          ),
        ).toBeVisible();
        await expect(familia.page.getByText('Esperando aceptación').first()).toBeVisible();
      });

      // ── La trabajadora revisa y acepta ─────────────────────────────────────
      await test.step('La trabajadora ve exactamente lo que se acordó', async () => {
        await trabajadora.page.goto('/trabajadora');
        await trabajadora.page.getByRole('link', { name: 'Revisar las condiciones' }).click();

        await expect(trabajadora.page.getByTestId('remuneracion')).toContainText('350.000,00');
        // La fecha de calendario no se corre por zona horaria: se cargó el 1/9.
        await expect(trabajadora.page.getByText('01/09/2026')).toBeVisible();
        await expect(trabajadora.page.getByTestId('total-semanal')).toHaveText('16 h 30 min');
        await expect(
          trabajadora.page.getByText('Con retiro (se retira al terminar la jornada)'),
        ).toBeVisible();
        await expect(
          trabajadora.page
            .getByText(
              'Los parámetros disponibles son datos de prueba y no constituyen una liquidación oficial.',
            )
            .first(),
        ).toBeVisible();
      });

      await test.step('Acepta y la relación queda activa', async () => {
        await trabajadora.page.getByRole('button', { name: 'Acepto estas condiciones' }).click();
        await expect(
          trabajadora.page.getByText(
            'Aceptaste las condiciones. La relación laboral quedó activa.',
          ),
        ).toBeVisible();
        await expect(trabajadora.page.getByText('Activa').first()).toBeVisible();
      });

      await test.step('La familia ve la relación activa en su panel', async () => {
        await familia.page.goto('/familia');
        await expect(familia.page.getByText('Activa').first()).toBeVisible();
      });
    } finally {
      await familia.cerrar();
      await trabajadora.cerrar();
    }
  });

  test('una invitación dada de baja no se puede aceptar', async ({ browser }) => {
    const familia = await abrirPersona(browser, 'familia-baja');
    const trabajadora = await abrirPersona(browser, 'trabajadora-baja');

    try {
      await ingresar(familia.page, familia.email);
      await familia.page.goto('/onboarding/familia');
      await crearPerfil(familia.page, {
        nombre: 'Lucía',
        apellido: 'Fernández',
        telefono: '+54 11 3333-2222',
      });
      await cargarDomicilio(familia.page);

      await familia.page.goto('/familia/invitaciones/nueva');
      await familia.page.getByLabel('Correo de la trabajadora').fill(trabajadora.email);
      await familia.page.getByRole('button', { name: 'Enviar invitación' }).click();
      await expect(familia.page).toHaveURL(/\/familia\/invitaciones/);

      const token = await tokenInvitacion(familia.page.request, trabajadora.email);

      await test.step('La familia da de baja la invitación, con confirmación', async () => {
        await familia.page.getByRole('button', { name: 'Dar de baja' }).click();
        // La acción destructiva pide confirmación antes de ejecutarse.
        await expect(familia.page.getByText('¿Dar de baja esta invitación?')).toBeVisible();
        await familia.page.getByRole('button', { name: 'Sí, confirmar' }).click();

        await expect(familia.page.getByText(/Dimos de baja la invitación/)).toBeVisible();
        await expect(familia.page.getByText('Dada de baja')).toBeVisible();
      });

      await test.step('El enlace deja de servir y lo explica', async () => {
        await trabajadora.page.goto(`/invitacion/${token}`);
        await expect(
          trabajadora.page.getByRole('heading', { name: 'Esta invitación fue dada de baja' }),
        ).toBeVisible();
        await expect(
          trabajadora.page.getByRole('button', { name: 'Aceptar la invitación' }),
        ).toHaveCount(0);
      });
    } finally {
      await familia.cerrar();
      await trabajadora.cerrar();
    }
  });

  test('un enlace inválido explica el problema en lugar de romperse', async ({ page }) => {
    await page.goto('/invitacion/token-que-no-existe-pero-tiene-largo');
    await expect(
      page.getByRole('heading', { name: 'No pudimos abrir esta invitación' }),
    ).toBeVisible();
  });

  test('sin sesión, el panel de la familia redirige a ingresar', async ({ page }) => {
    await page.goto('/familia');
    await expect(page).toHaveURL(/\/ingresar/);
  });
});
