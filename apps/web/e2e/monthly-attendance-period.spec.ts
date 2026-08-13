import { expect, test, type Browser, type Page } from '@playwright/test';
import {
  cargarCondiciones,
  cargarDomicilio,
  cargarHorario,
  correoUnico,
  crearJornadaAprobadaHistorica,
  crearPerfil,
  ingresar,
  tokenInvitacion,
} from './support/helpers';

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

test.describe('E3.9: Período mensual y cierre de asistencia', () => {
  test('la familia revisa el resumen mensual, cierra la asistencia de un mes finalizado y se genera el snapshot inmutable', async ({
    browser,
  }) => {
    const familia = await abrirPersona(browser, 'familia');
    const trabajadora = await abrirPersona(browser, 'trabajadora');

    try {
      // ── 1. Onboarding inicial hasta dejar la relación ACTIVE ────────────────
      await ingresar(familia.page, familia.email);
      await familia.page.goto('/onboarding/familia');
      await crearPerfil(familia.page, {
        nombre: 'Valeria',
        apellido: 'Gómez',
        telefono: '+54 11 5555-6666',
      });
      await cargarDomicilio(familia.page);

      // Invitar trabajadora
      await familia.page.goto('/familia/invitaciones/nueva');
      await familia.page.getByLabel('Correo de la trabajadora').fill(trabajadora.email);
      await familia.page.getByRole('button', { name: 'Enviar invitación' }).click();
      await expect(familia.page).toHaveURL(/\/familia\/invitaciones/);
      await expect(familia.page.getByText('Enviamos la invitación por correo.')).toBeVisible();

      const token = await tokenInvitacion(familia.page.request, trabajadora.email);

      // Trabajadora ingresa y crea perfil
      await trabajadora.page.goto(`/invitacion/${token}`);
      await trabajadora.page.getByRole('link', { name: /Ingresar con/ }).click();
      await ingresar(trabajadora.page, trabajadora.email);
      await trabajadora.page.goto('/onboarding/trabajadora');
      await crearPerfil(trabajadora.page, {
        nombre: 'Estela',
        apellido: 'Benítez',
        telefono: '+54 11 7777-8888',
      });

      // Trabajadora acepta la invitación
      await trabajadora.page.goto(`/invitacion/${token}`);
      await trabajadora.page.getByRole('button', { name: 'Aceptar la invitación' }).click();
      await expect(trabajadora.page).toHaveURL(/\/trabajadora\/relaciones\//);

      // Familia configura condiciones y horario
      await familia.page.goto('/familia');
      await familia.page.getByRole('link', { name: 'Continuar' }).first().click();
      await expect(familia.page).toHaveURL(/\/familia\/relaciones\//);
      await cargarCondiciones(familia.page);
      await cargarHorario(familia.page);
      await familia.page.getByRole('button', { name: 'Enviar a la trabajadora' }).click();
      await expect(familia.page.getByText('Esperando aceptación').first()).toBeVisible();

      // Trabajadora acepta condiciones -> pasa a ACTIVE
      await trabajadora.page.goto('/trabajadora');
      await trabajadora.page.getByRole('link', { name: 'Revisar las condiciones' }).click();
      await trabajadora.page.getByRole('button', { name: 'Acepto estas condiciones' }).click();
      await expect(
        trabajadora.page.getByText('Aceptaste las condiciones. La relación laboral quedó activa.'),
      ).toBeVisible();

      const urlRelacion = trabajadora.page.url();
      const match = urlRelacion.match(/relaciones\/([a-f0-9-]+)/i);
      const relacionId = match ? match[1] : '';

      // ── 2. Fichaje por la trabajadora (entrada y salida) del día de hoy ────
      await test.step('Trabajadora registra entrada y salida hoy', async () => {
        await trabajadora.page.goto(`/trabajadora/relaciones/${relacionId}`);
        await expect(
          trabajadora.page.getByRole('heading', { name: 'Asistencia de hoy' }),
        ).toBeVisible();

        const botonEntrada = trabajadora.page.getByRole('button', { name: /Fichar entrada/ });
        await expect(botonEntrada).toBeVisible();
        await botonEntrada.click();
        await expect(
          trabajadora.page.getByText('¡Fichaste la entrada correctamente!'),
        ).toBeVisible();

        const botonSalida = trabajadora.page.getByRole('button', { name: /Fichar salida/ });
        await expect(botonSalida).toBeVisible();
        await botonSalida.click();
        await expect(
          trabajadora.page.getByText('¡Fichaste la salida correctamente!'),
        ).toBeVisible();
      });

      // ── 3. Familia ve el mes en curso: bloqueado para cierre por estar en curso
      await test.step('Familia ve que el mes en curso no puede cerrarse aún', async () => {
        await familia.page.goto(`/familia/relaciones/${relacionId}`);
        await expect(
          familia.page.getByRole('heading', { name: 'Período mensual de asistencia' }),
        ).toBeVisible();

        // El botón de cierre del mes en curso está deshabilitado
        const botonCerrar = familia.page.locator('#boton-cerrar-asistencia-periodo');
        await expect(botonCerrar).toBeDisabled();
        await expect(
          familia.page.getByText(
            /El período mensual sigue en curso. Podrás cerrar la asistencia cuando finalice el mes./,
          ),
        ).toBeVisible();
      });

      // ── 4. Familia aprueba la jornada de hoy ────────────────────────────────
      await test.step('Familia aprueba la jornada del mes actual', async () => {
        const botonAprobar = familia.page.getByRole('button', { name: 'Aprobar' }).first();
        await expect(botonAprobar).toBeVisible();
        await botonAprobar.click();
        await expect(familia.page.getByText('Aprobaste la jornada de trabajo.')).toBeVisible();
      });

      // ── 5. Inyectar jornada aprobada en mes finalizado y cerrar período ────
      await test.step('Familia navega al mes anterior finalizado, revisa y cierra la asistencia', async () => {
        // Inyectamos jornada aprobada en un mes concluido (ej: mes anterior)
        const hoy = new Date();
        const mesAnterior = hoy.getMonth() === 0 ? 12 : hoy.getMonth();
        const anioAnterior = hoy.getMonth() === 0 ? hoy.getFullYear() - 1 : hoy.getFullYear();
        const fechaHistorica = `${anioAnterior}-${String(mesAnterior).padStart(2, '0')}-15`;

        await crearJornadaAprobadaHistorica(familia.page.request, relacionId, fechaHistorica, 480);

        await familia.page.goto(`/familia/relaciones/${relacionId}`);
        await expect(
          familia.page.getByRole('heading', { name: 'Período mensual de asistencia' }),
        ).toBeVisible();

        // Navegamos al mes anterior
        await familia.page.getByRole('button', { name: 'Mes anterior' }).click();

        // En el mes anterior concluido con jornada aprobada, el botón está habilitado
        const botonCerrar = familia.page.locator('#boton-cerrar-asistencia-periodo');
        await expect(botonCerrar).toBeEnabled();
        await botonCerrar.click();

        // Modal de confirmación
        await expect(
          familia.page.getByText(/Estás por cerrar la asistencia mensual de la relación laboral/),
        ).toBeVisible();
        await expect(familia.page.getByText(/snapshot inmutable con huella SHA-256/)).toBeVisible();

        const botonConfirmar = familia.page.locator('#boton-confirmar-cierre-periodo');
        await botonConfirmar.click();

        // Verificación de cierre exitoso
        await expect(familia.page.getByText(/Cerraste la asistencia de/)).toBeVisible();
        await expect(familia.page.getByText('Asistencia cerrada e inmutable')).toBeVisible();
        await expect(familia.page.getByText(/Huella SHA-256:/)).toBeVisible();
      });

      // ── 6. Trabajadora ve el período mensual cerrado (modo solo lectura) ───
      await test.step('Trabajadora ve el período cerrado de forma inmutable', async () => {
        await trabajadora.page.goto(`/trabajadora/relaciones/${relacionId}`);
        await expect(
          trabajadora.page.getByRole('heading', { name: 'Período mensual de asistencia' }),
        ).toBeVisible();

        // Navegamos al mes anterior cerrado
        await trabajadora.page.getByRole('button', { name: 'Mes anterior' }).click();

        await expect(trabajadora.page.getByText('Asistencia cerrada e inmutable')).toBeVisible();
        await expect(trabajadora.page.getByText(/Huella SHA-256:/)).toBeVisible();
        // La trabajadora no tiene botón de cierre
        await expect(
          trabajadora.page.locator('#boton-cerrar-asistencia-periodo'),
        ).not.toBeVisible();
      });
    } finally {
      await familia.cerrar();
      await trabajadora.cerrar();
    }
  });
});
