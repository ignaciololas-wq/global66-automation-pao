'use strict';
// Script de diagnóstico: verifica que Playwright puede conectarse y loguearse en Finecto.
// Corre con: node scripts/test.js
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const { chromium } = require('playwright');

async function testFinecto() {
  console.log('🎭 Iniciando test de Playwright...');
  console.log('   FINECTO_URL:', process.env.FINECTO_URL || '(no definida)');
  console.log('   FINECTO_USER:', process.env.FINECTO_USER || '(no definido)');

  if (!process.env.FINECTO_URL) {
    console.error('❌ FINECTO_URL no está definida en .env. Abortando.');
    process.exit(1);
  }

  // headless: false para ver el navegador durante el test
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page    = await context.newPage();

  try {
    console.log('\n📡 Cargando página de Finecto...');
    await page.goto(process.env.FINECTO_URL, { waitUntil: 'networkidle', timeout: 30_000 });
    console.log('✅ Página cargada. Título:', await page.title());

    // Esperar campo de usuario y completar credenciales
    await page.waitForSelector('#username, input[name="username"], input[type="email"]', { timeout: 10_000 });
    console.log('🔑 Rellenando credenciales...');

    await page.fill('#username, input[name="username"], input[type="email"]', process.env.FINECTO_USER);
    await page.fill('#password, input[name="password"], input[type="password"]', process.env.FINECTO_PASSWORD);

    await page.screenshot({ path: 'test-antes-login.png' });
    console.log('📸 Screenshot pre-login guardado en test-antes-login.png');

    await page.click('button[type="submit"]');
    await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 15_000 });

    console.log('✅ Login completado. URL actual:', page.url());
    await page.screenshot({ path: 'test-despues-login.png' });
    console.log('📸 Screenshot post-login guardado en test-despues-login.png');
    console.log('\n✅ Test completado exitosamente.');

  } catch (err) {
    console.error('\n❌ Error durante el test:', err.message);
    await page.screenshot({ path: 'test-error.png' }).catch(() => {});
    console.log('📸 Screenshot del error guardado en test-error.png');
    process.exitCode = 1;

  } finally {
    await browser.close();
    console.log('🏁 Navegador cerrado.');
  }
}

testFinecto();
