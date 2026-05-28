'use strict';
require('dotenv').config();
const { chromium } = require('playwright');
const { marcarRegistradoFinecto } = require('./supabase');

/**
 * Entra a Finecto con Playwright y crea el registro del contrato.
 * Los selectores (#username, [name="..."], etc.) deben ajustarse
 * a la UI real de Finecto una vez que tengas acceso visual.
 */
async function crearRegistroFinecto(contrato) {
  const browser = await chromium.launch({
    headless: true, // cambiar a false para debug visual
    args: ['--no-sandbox'],
  });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // — Login —
    console.log('[Playwright] Accediendo a Finecto...');
    await page.goto(process.env.FINECTO_URL, { waitUntil: 'networkidle' });

    await page.fill('#username', process.env.FINECTO_USER);
    await page.fill('#password', process.env.FINECTO_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForNavigation({ waitUntil: 'networkidle' });
    console.log('[Playwright] Login exitoso. URL:', page.url());

    // — Navegar a módulo de contratos —
    // NOTA: ajustar el selector al menú real de Finecto
    await page.click('a[href*="contratos"], nav >> text=Contratos');
    await page.waitForLoadState('networkidle');

    // — Abrir formulario de nuevo contrato —
    await page.click('button:has-text("Nuevo"), a:has-text("Nuevo contrato")');
    await page.waitForLoadState('networkidle');

    // — Completar campos —
    // NOTA: los name/id de los inputs deben verificarse en la UI real de Finecto
    await page.fill('[name="nombre_proveedor"], #nombre_proveedor', contrato.nombre_proveedor);
    await page.fill('[name="rut"],              #rut',              contrato.rut_proveedor);
    await page.fill('[name="monto"],            #monto',            String(contrato.monto));
    await page.fill('[name="vigencia"],         #vigencia',         contrato.vigencia);
    await page.selectOption(
      '[name="tipo_contrato"], #tipo_contrato',
      contrato.tipo_contrato
    );

    // — Guardar —
    await page.click('button[type="submit"]:has-text("Guardar"), button:has-text("Crear")');
    await page.waitForLoadState('networkidle');

    // Verificar mensaje de éxito (adaptar el selector al feedback real de Finecto)
    const exito = await page
      .locator('.alert-success, .toast-success, :has-text("creado exitosamente")')
      .isVisible({ timeout: 5000 })
      .catch(() => false);

    if (!exito) throw new Error('No se detectó confirmación de éxito en Finecto');

    await marcarRegistradoFinecto(contrato.id);
    console.log(`[Playwright] Contrato ${contrato.id} registrado en Finecto.`);

  } finally {
    await browser.close();
  }
}

module.exports = { crearRegistroFinecto };
