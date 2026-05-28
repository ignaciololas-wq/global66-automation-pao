// UI smoke test con Playwright. Verifica que admin renderiza + nodos canvas visibles + tildes correctas.
import { chromium } from 'playwright';

const URL_BASE = process.env.UI_TEST_URL ?? 'http://localhost:3000';
const RUN_ID = process.env.UI_TEST_RUN_ID ?? '682c90fb-f7cf-420d-ac9a-608d4881f97e';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  const log = (msg) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${msg}`);

  // Capture console errors
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console.error: ${m.text()}`); });

  log('1) Navegar a /admin (espera redirect a login si auth on, o ver landing)');
  await page.goto(`${URL_BASE}/admin`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  const title = await page.title();
  log(`   title: ${title}`);

  log('2) Screenshot inicial');
  await page.screenshot({ path: '/tmp/ui-1-admin-initial.png', fullPage: true });

  log('3) Navegar a workflows');
  await page.goto(`${URL_BASE}/admin#workflows`, { waitUntil: 'networkidle', timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(2000);
  await page.screenshot({ path: '/tmp/ui-2-workflows.png', fullPage: true });

  log('4) Navegar a workflow detail con run conocido');
  await page.goto(`${URL_BASE}/admin#workflows/${RUN_ID}`, { waitUntil: 'networkidle', timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(2500);
  await page.screenshot({ path: '/tmp/ui-3-workflow-detail.png', fullPage: true });

  // Verificar flow canvas + nodos
  const hasCanvas = await page.locator('.flow-canvas').count();
  const nodeCount = await page.locator('.lever-node, .flow-node').count();
  log(`   .flow-canvas: ${hasCanvas} | nodos: ${nodeCount}`);

  // Buscar tildes en el HTML
  const html = await page.content();
  const hasTildes = /Aprobación|validación|Administración/.test(html);
  const hasQuestionMarks = /\?\?[a-z]/i.test(html);
  log(`   tildes OK: ${hasTildes} | ?? rotos: ${hasQuestionMarks}`);

  log('5) Test responsive — viewport mobile');
  await page.setViewportSize({ width: 375, height: 812 });
  await page.waitForTimeout(800);
  await page.screenshot({ path: '/tmp/ui-4-mobile.png', fullPage: true });

  log('6) Errors capturados:');
  if (errors.length) errors.slice(0, 10).forEach(e => console.log('   ' + e));
  else console.log('   (ninguno)');

  await browser.close();

  const ok = hasCanvas > 0 && nodeCount >= 6 && hasTildes && !hasQuestionMarks;
  console.log(`\n${ok ? '✅' : '❌'} UI smoke ${ok ? 'PASSED' : 'FAILED'}`);
  console.log(`   Screenshots: /tmp/ui-{1,2,3,4}-*.png`);
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error('❌ UI smoke FAILED:', e.message);
  process.exit(1);
});
