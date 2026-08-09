import { expect, test, type Browser, type Page } from '@playwright/test';
import {
  cargarCondiciones,
  cargarDomicilio,
  cargarHorario,
  correoUnico,
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

test.describe('E3.7–E3.8: Fichaje, correcciones y aprobación de jornadas', () => {
  test('la trabajadora ficha entrada y salida, la familia aprueba la jornada', async ({
    browser,
  }) => {
    const familia = await abrirPersona(browser, 'familia');
    const trabajadora = await abrirPersona(browser, 'trabajadora');

    try {
      // ── Onboarding inicial hasta dejar la relación ACTIVE ──────────────────
      await ingresar(familia.page, familia.email);
      await familia.page.getByRole('link', { name: 'Crear mi perfil de familia' }).click();
      await crearPerfil(familia.page, {
        nombre: 'Carolina',
        apellido: 'Martínez',
        telefono: '+54 11 4444-5555',
      });
      await cargarDomicilio(familia.page);

      // Invitar trabajadora
      await familia.page.goto('/familia/invitaciones/nueva');
      await familia.page.getByLabel('Correo de la trabajadora').fill(trabajadora.email);
      await familia.page.getByRole('button', { name: 'Enviar invitación' }).click();

      const token = await tokenInvitacion(familia.page.request, trabajadora.email);

      // Trabajadora acepta
      await trabajadora.page.goto(`/invitacion/${token}`);
      await trabajadora.page.getByRole('link', { name: /Ingresar con/ }).click();
      await ingresar(trabajadora.page, trabajadora.email);
      await trabajadora.page.getByRole('link', { name: 'Crear mi perfil de trabajadora' }).click();
      await crearPerfil(trabajadora.page, {
        nombre: 'Rosa',
        apellido: 'López',
        telefono: '+54 11 3333-2222',
      });
      await trabajadora.page.getByRole('button', { name: 'Aceptar invitación' }).click();

      // Familia configura condiciones y horario
      await familia.page.goto('/familia');
      await familia.page.getByRole('link', { name: 'Completar condiciones' }).click();
      await cargarCondiciones(familia.page);
      await cargarHorario(familia.page);
      await familia.page.getByRole('button', { name: 'Enviar a la trabajadora' }).click();

      // Trabajadora acepta condiciones -> pasa a ACTIVE
      await trabajadora.page.goto('/trabajadora');
      await trabajadora.page.getByRole('link', { name: 'Revisar las condiciones' }).click();
      await trabajadora.page.getByRole('button', { name: 'Acepto estas condiciones' }).click();
      await expect(trabajadora.page.getByText('La relación laboral quedó activa')).toBeVisible();

      // Extraer ID de la relación desde la URL
      const urlRelacion = trabajadora.page.url();
      const match = urlRelacion.match(/relaciones\/([a-f0-9-]+)/i);
      const relacionId = match ? match[1] : '';

      // ── E3.7: Fichaje por la trabajadora ──────────────────────────────────
      await test.step('Trabajadora ficha entrada', async () => {
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
        await expect(trabajadora.page.getByText('Hora de entrada registrada:')).toBeVisible();
      });

      await test.step('Trabajadora ficha salida', async () => {
        const botonSalida = trabajadora.page.getByRole('button', { name: /Fichar salida/ });
        await expect(botonSalida).toBeVisible();
        await botonSalida.click();

        await expect(
          trabajadora.page.getByText('¡Fichaste la salida correctamente!'),
        ).toBeVisible();
        await expect(trabajadora.page.getByText('Pendiente de aprobación')).toBeVisible();
      });

      // ── E3.8: Revisión y aprobación por la familia ─────────────────────────
      await test.step('Familia ve la jornada y la aprueba', async () => {
        await familia.page.goto(`/familia/relaciones/${relacionId}`);
        await expect(
          familia.page.getByRole('heading', { name: 'Jornadas registradas' }),
        ).toBeVisible();

        const botonAprobar = familia.page.getByRole('button', { name: 'Aprobar' }).first();
        await expect(botonAprobar).toBeVisible();
        await botonAprobar.click();

        await expect(familia.page.getByText('Aprobaste la jornada de trabajo.')).toBeVisible();
        await expect(familia.page.getByText('Aprobada')).toBeVisible();
      });

      await test.step('Trabajadora ve la jornada aprobada con su tiempo computado', async () => {
        await trabajadora.page.goto(`/trabajadora/relaciones/${relacionId}`);
        await expect(
          trabajadora.page.getByText(/Jornada aprobada por la familia empleadora/),
        ).toBeVisible();
      });
    } finally {
      await familia.cerrar();
      await trabajadora.cerrar();
    }
  });
});
