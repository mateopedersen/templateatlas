import { chromium } from 'playwright';
import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
const [origin, output] = process.argv.slice(2),
  base = new URL(origin);
if (!['localhost', '127.0.0.1'].includes(base.hostname) || !output)
  throw Error('Use a local preview and an output JSON path.');
const require = createRequire(import.meta.url),
  axe = await readFile(require.resolve('axe-core/axe.min.js'), 'utf8');
const paths = [
  '/',
  '/templates/',
  '/categories/charts-graphs/',
  '/templates/project-proposal/',
  '/create/chart/',
  '/create/form/',
  '/create/invoice/',
  '/search/?q=budget',
  '/signup/',
  '/contact/',
];
const browser = await chromium.launch({
  channel: process.env.CHROME_CHANNEL || 'chrome',
  headless: true,
});
const results = [],
  keyboard = {};
try {
  for (const width of [390, 1440]) {
    const p = await browser.newPage({
      viewport: { width, height: 900 },
      reducedMotion: 'reduce',
    });
    const errors = [];
    p.on('pageerror', (e) => errors.push(e.message));
    await p.addInitScript(() => {
      window.__metrics = { lcp: null, cls: 0 };
      new PerformanceObserver((ls) => {
        const last = ls.getEntries().at(-1);
        if (last) window.__metrics.lcp = Math.round(last.startTime);
      }).observe({ type: 'largest-contentful-paint', buffered: true });
      new PerformanceObserver((ls) => {
        for (const s of ls.getEntries())
          if (!s.hadRecentInput) window.__metrics.cls += s.value;
      }).observe({ type: 'layout-shift', buffered: true });
    });
    for (const path of paths) {
      await p.goto(new URL(path, base).href, { waitUntil: 'networkidle' });
      await p.evaluate(axe);
      const row = await p.evaluate(async () => {
        const out = await window.axe.run(document, {
          runOnly: {
            type: 'tag',
            values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'],
          },
        });
        return {
          metrics: window.__metrics,
          width: document.documentElement.scrollWidth,
          issues: out.violations.map((v) => ({
            id: v.id,
            impact: v.impact,
            targets: v.nodes
              .map((n) => ({ target: n.target, summary: n.failureSummary }))
              .slice(0, 10),
          })),
        };
      });
      results.push({ width, path, ...row });
    }
    if (width === 390) {
      await p.goto(new URL('/templates/project-proposal/', base).href);
      await p.locator('.mobile-toggle').focus();
      await p.keyboard.press('Enter');
      keyboard.mobileDialog = await p.getByRole('dialog').isVisible();
      await p.keyboard.press('Escape');
      keyboard.escapeRestoresFocus = await p
        .locator('.mobile-toggle')
        .evaluate((e) => document.activeElement === e);
    }
    if (width === 1440) {
      await p.goto(base.href);
      await p.locator('#global-search').focus();
      await p.keyboard.type('invoice');
      await p.getByRole('listbox').waitFor();
      await p.keyboard.press('ArrowDown');
      await p.keyboard.press('Enter');
      await p.waitForURL('**/templates/invoice/');
      keyboard.searchToInvoice = true;
    }
    results.push({ width, browserErrors: errors });
    await p.close();
  }
} finally {
  await browser.close();
}
const result = {
  environment:
    'loopback, headless Chromium, unthrottled, reduced motion; local lab samples',
  keyboard,
  results,
};
await writeFile(output, JSON.stringify(result, null, 2));
console.log(
  JSON.stringify({
    pages: results.filter((r) => r.path).length,
    serious: results
      .flatMap((r) => r.issues || [])
      .filter((v) => ['critical', 'serious'].includes(v.impact))
      .map((v) => v.id),
    keyboard,
  }),
);
