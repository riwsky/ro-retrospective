// Renders the D3 and Mermaid diagrams from index.html into assets/*.png
// for use in retro-slides.md.
//
// Usage:
//   npm install --no-save playwright
//   npx playwright install chromium
//   node scripts/render-assets.js
//
// If your environment can't reach cdn.jsdelivr.net, drop local copies of
// mermaid.min.js, d3.js, and rough.js into scripts/libs/ and they'll be
// served in place of the CDN.

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const repoRoot = path.resolve(__dirname, '..');
const outDir = path.join(repoRoot, 'assets');
const libsDir = path.join(__dirname, 'libs');

(async () => {
  fs.mkdirSync(outDir, { recursive: true });

  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 1600, height: 1200 },
    deviceScaleFactor: 2,
  });
  const page = await ctx.newPage();

  if (fs.existsSync(libsDir)) {
    await page.route('**/cdn.jsdelivr.net/**', async (route) => {
      const url = route.request().url();
      let file;
      if (url.includes('mermaid')) file = 'mermaid.min.js';
      else if (url.includes('d3@')) file = 'd3.js';
      else if (url.includes('roughjs')) file = 'rough.js';
      if (!file) return route.continue();
      const full = path.join(libsDir, file);
      if (!fs.existsSync(full)) return route.continue();
      await route.fulfill({
        status: 200,
        contentType: 'application/javascript',
        body: fs.readFileSync(full),
      });
    });
  }

  await page.goto('file://' + path.join(repoRoot, 'index.html'), { waitUntil: 'networkidle' });
  await page.waitForSelector('#powerlaw-bare svg');
  await page.waitForSelector('#pareto-plot svg');
  await page.waitForSelector('#powerlaw-plot svg');
  await page.waitForSelector('.mermaid svg');
  await page.waitForTimeout(1500);

  // Strip page/svg backgrounds so omitBackground produces true alpha.
  await page.addStyleTag({
    content: `
      html, body, article, section, figure, .mermaid, svg { background: transparent !important; }
      .mermaid svg, .mermaid svg .background { background-color: transparent !important; fill: transparent !important; }
    `,
  });

  const shot = { omitBackground: true };

  // Bare power-law curve
  await (await page.$('#powerlaw-bare svg')).screenshot({ path: path.join(outDir, 'longtail.png'), ...shot });

  // Pareto frontier: labels extend past the SVG (overflow:visible), so
  // clip a padded region of the page instead of the element's own bbox.
  await page.evaluate(() => document.querySelector('#pareto-plot svg').scrollIntoView());
  await page.waitForTimeout(200);
  const paretoClip = await page.evaluate(() => {
    const r = document.querySelector('#pareto-plot svg').getBoundingClientRect();
    // The right-side label ("Full Multi-Turn Agent") extends past the
    // svg's bbox due to overflow:visible; pad horizontally. The bbox
    // already contains the axis label at the bottom, so no bottom pad --
    // otherwise the paragraph below bleeds into the frame.
    const padX = 20;
    const padTop = 20;
    return {
      x: Math.max(0, r.x - padX),
      y: Math.max(0, r.y - padTop),
      width: r.width + padX * 2 + 80,
      height: r.height + padTop,
    };
  });
  await page.screenshot({ path: path.join(outDir, 'frontier.png'), clip: paretoClip, ...shot });

  // Shaded power-law with the three coverage tiers
  await (await page.$('#powerlaw-plot svg')).screenshot({ path: path.join(outDir, 'tiers.png'), ...shot });

  // Mermaid: [0] is the architecture flowchart, [1] is the appendix state machine
  const mermaids = await page.$$('.mermaid svg');
  await mermaids[0].screenshot({ path: path.join(outDir, 'architecture.png'), ...shot });
  await mermaids[1].screenshot({ path: path.join(outDir, 'statemachine.png'), ...shot });

  await browser.close();
})();
