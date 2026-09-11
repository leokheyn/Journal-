#!/usr/bin/env node
/**
 * Check that a built roundup page fits its 5x7in page, using the REAL
 * typefaces. Checking without them is worthless: the fallback serif has
 * different metrics, so a page can measure clean under the fallback and still
 * clip in print.
 *
 *   node .claude/skills/monthly-roundup/check_fit.js roundups/2026-08.html
 *
 * Exits non-zero if anything overflows.
 */

const fs = require("fs");
const path = require("path");
const { withRealFonts, findChromium } = require("./fonts");

const ROOT = path.resolve(__dirname, "..", "..", "..");

(async () => {
  const target = process.argv[2];
  if (!target) { console.error("usage: check_fit.js <page.html>"); process.exit(1); }

  const { css, html } = withRealFonts(fs.readFileSync(target, "utf8"),
                                      path.join(ROOT, "node_modules"));
  const doc = `<!doctype html><html><head><meta charset="utf-8">
<style>${css}
:root{color-scheme:light} html,body{margin:0;padding:0} img{max-width:100%}</style>
</head><body>${html}</body></html>`;

  const tmp = path.join(require("os").tmpdir(), "roundup-fit-" + process.pid + ".html");
  fs.writeFileSync(tmp, doc);

  const exe = findChromium();
  const { chromium } = require("playwright-core");
  const browser = await chromium.launch(exe ? { executablePath: exe } : {});
  const page = await browser.newPage({ viewport: { width: 900, height: 1200 } });
  await page.goto("file://" + tmp, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);

  const r = await page.evaluate(() => {
    const pg = document.getElementById("page");
    const scale = pg.getBoundingClientRect().width / pg.offsetWidth;
    const px = n => Math.round(n / scale);
    // anything whose painted bottom sits past the page's padding box is clipped
    const bottom = pg.getBoundingClientRect().bottom;
    const spills = [];
    for (const el of pg.querySelectorAll("*")) {
      const b = el.getBoundingClientRect();
      if (b.height && b.bottom > bottom + 0.5) {
        spills.push({ el: el.className || el.tagName, over: px(b.bottom - bottom) });
      }
    }
    const seen = new Set();
    return {
      pageH: pg.offsetHeight, contentH: pg.scrollHeight,
      overflow: pg.scrollHeight - pg.clientHeight,
      photo: px(document.querySelector(".polaroid .frame")?.getBoundingClientRect().height || 0),
      titleLines: (() => { const t = document.querySelector(".title");
        return t ? Math.round(t.getBoundingClientRect().height / parseFloat(getComputedStyle(t).lineHeight)) : 0; })(),
      spills: spills.filter(s => !seen.has(s.el) && seen.add(s.el)).slice(0, 8),
    };
  });

  await browser.close();
  fs.unlinkSync(tmp);

  console.log(`page ${r.pageH}px, content ${r.contentH}px, title ${r.titleLines} line(s), photo ${r.photo}px`);
  const bad = r.overflow > 0 || r.spills.length;
  if (bad) {
    console.error(`OVERFLOW by ${r.overflow}px — clipped:`);
    for (const s of r.spills) console.error(`  ${s.el}  ${s.over}px past the edge`);
  } else {
    console.log("fits");
  }
  process.exit(bad ? 1 : 0);
})();
