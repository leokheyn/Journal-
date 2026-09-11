#!/usr/bin/env node
/**
 * Render a built roundup page to a print-ready PDF.
 *
 * The page is placed at its exact 5x7in size, centred on US Letter, with
 * hairline crop marks at the four corners to cut against. The marks sit
 * outside the trim box, so nothing of them survives on the trimmed piece.
 *
 * The three typefaces are embedded from node_modules rather than fetched
 * from Google Fonts, because a PDF that silently falls back to a generic
 * serif loses the whole point of the design.
 *
 *   node .claude/skills/monthly-roundup/to_pdf.js \
 *     --in roundups/2026-08.html --out roundups/2026-08.pdf
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..", "..");
const PAGE_W = 5, PAGE_H = 7;            // inches, the trim size
const SHEET_W = 8.5, SHEET_H = 11;       // inches, the paper

/* Each face the template actually asks for. */
const FACES = [
  ["Caveat", "caveat", 400, "normal"],
  ["Caveat", "caveat", 500, "normal"],
  ["Caveat", "caveat", 600, "normal"],
  ["Caveat", "caveat", 700, "normal"],
  ["Courier Prime", "courier-prime", 400, "normal"],
  ["Courier Prime", "courier-prime", 700, "normal"],
  ["Crimson Pro", "crimson-pro", 400, "normal"],
  ["Crimson Pro", "crimson-pro", 600, "normal"],
  ["Crimson Pro", "crimson-pro", 400, "italic"],
];

function fontFaces(modulesDir) {
  const out = [];
  for (const [family, pkg, weight, style] of FACES) {
    const file = path.join(modulesDir, "@fontsource", pkg, "files",
      `${pkg}-latin-${weight}-${style}.woff2`);
    if (!fs.existsSync(file)) {
      console.error(`  ! missing ${path.basename(file)} — that weight will fall back`);
      continue;
    }
    const b64 = fs.readFileSync(file).toString("base64");
    out.push(`@font-face{font-family:"${family}";font-style:${style};font-weight:${weight};` +
             `font-display:block;src:url(data:font/woff2;base64,${b64}) format("woff2");}`);
  }
  return out.join("\n");
}

/* crop marks: two hairlines per corner, held off the trim edge */
function cropMarks() {
  const L = (SHEET_W - PAGE_W) / 2, T = (SHEET_H - PAGE_H) / 2;
  const R = L + PAGE_W, B = T + PAGE_H;
  const GAP = 0.09, LEN = 0.26;              // inches
  const marks = [];
  /* explicit classes, not [style*=...] — "width:0.26in" contains "width:0", so
     substring matching silently strips the border off every mark */
  const h = (x, y) => marks.push(`<div class="cm cm-h" style="left:${x}in;top:${y}in;width:${LEN}in"></div>`);
  const v = (x, y) => marks.push(`<div class="cm cm-v" style="left:${x}in;top:${y}in;height:${LEN}in"></div>`);
  for (const [x, y, sx, sy] of [[L, T, -1, -1], [R, T, 1, -1], [L, B, -1, 1], [R, B, 1, 1]]) {
    h(sx < 0 ? x - GAP - LEN : x + GAP, y);
    v(x, sy < 0 ? y - GAP - LEN : y + GAP);
  }
  return marks.join("");
}

function findChromium() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  const bases = ["/opt/pw-browsers", path.join(process.env.HOME || "", ".cache/ms-playwright")];
  for (const base of bases) {
    if (!fs.existsSync(base)) continue;
    for (const dir of fs.readdirSync(base)) {
      if (!/^chromium-/.test(dir)) continue;
      for (const rel of ["chrome-linux/chrome", "chrome-mac/Chromium.app/Contents/MacOS/Chromium"]) {
        const p = path.join(base, dir, rel);
        if (fs.existsSync(p)) return p;
      }
    }
  }
  return null;
}

(async () => {
  const args = require("util").parseArgs({
    options: { in: { type: "string" }, out: { type: "string" },
               modules: { type: "string" } },
  }).values;
  if (!args.in || !args.out) {
    console.error("usage: to_pdf.js --in <page.html> --out <page.pdf>");
    process.exit(1);
  }

  const modulesDir = args.modules || path.join(ROOT, "node_modules");
  let src = fs.readFileSync(args.in, "utf8");

  /* drop the Google Fonts link — it cannot be reached, and a silent fallback
     is worse than an obvious failure */
  src = src.replace(/<link[^>]*fonts\.(googleapis|gstatic)\.com[^>]*>/g, "");

  const doc = `<!doctype html><html><head><meta charset="utf-8">
<style>
${fontFaces(modulesDir)}
:root{color-scheme:light}
html,body{margin:0;padding:0}
img{max-width:100%}
</style>
</head><body>
${src}
<div id="sheet-marks">${cropMarks()}</div>
<style>
  /* this block comes last on purpose: it overrides the page's own print CSS */
  @page{ size:${SHEET_W}in ${SHEET_H}in; margin:0; }
  html,body{ width:${SHEET_W}in; height:${SHEET_H}in; background:#fff !important;
             margin:0 !important; padding:0 !important; display:block !important; }
  .chrome{ display:none !important; }
  .stage-wrap{ display:block !important; position:absolute !important;
               left:${(SHEET_W - PAGE_W) / 2}in !important; top:${(SHEET_H - PAGE_H) / 2}in !important;
               width:${PAGE_W}in !important; height:${PAGE_H}in !important; }
  .stage{ transform:none !important; }
  .page{ box-shadow:none !important; margin:0 !important; }
  #sheet-marks .cm{ position:absolute; }
  #sheet-marks .cm-h{ border-top:0.4pt solid #8A8A8A; height:0; }
  #sheet-marks .cm-v{ border-left:0.4pt solid #8A8A8A; width:0; }
  #sheet-label{ position:absolute; left:0; right:0; bottom:0.34in; text-align:center;
                font:7pt "Courier Prime", monospace; letter-spacing:.18em;
                color:#9A9A9A; text-transform:uppercase; }
</style>
<div id="sheet-label">trim to 5 &times; 7 in along the corner marks</div>
</body></html>`;

  const tmp = args.out.replace(/\.pdf$/, "") + ".print.html";
  fs.writeFileSync(tmp, doc);

  const exe = findChromium();
  const { chromium } = require("playwright-core");
  const browser = await chromium.launch(exe ? { executablePath: exe } : {});
  const page = await browser.newPage();
  const problems = [];
  page.on("pageerror", e => problems.push(String(e.message)));
  await page.goto("file://" + path.resolve(tmp), { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);

  /* prove the real faces are in use before committing to a PDF */
  const fontCheck = await page.evaluate(() => {
    const seen = {};
    for (const f of document.fonts) seen[f.family + " " + f.weight + " " + f.style] = f.status;
    const t = document.querySelector(".title");
    return { loaded: seen, titleFamily: t ? getComputedStyle(t).fontFamily : null,
             titleWidth: t ? Math.round(t.scrollWidth) : 0 };
  });
  const anyUnloaded = Object.entries(fontCheck.loaded).filter(([, s]) => s !== "loaded");
  if (anyUnloaded.length) console.error("  ! not loaded:", anyUnloaded.map(([k]) => k).join(", "));
  console.log(`  fonts embedded: ${Object.keys(fontCheck.loaded).length}, all loaded: ${!anyUnloaded.length}`);

  await page.pdf({ path: args.out, printBackground: true, preferCSSPageSize: true });
  await browser.close();
  if (!process.env.KEEP_PRINT_HTML) fs.unlinkSync(tmp);

  if (problems.length) console.error("  ! page errors:", problems.join("; "));
  const kb = Math.round(fs.statSync(args.out).size / 1024);
  console.log(`  wrote ${args.out} (${kb} KB) — ${PAGE_W}x${PAGE_H}in centred on ${SHEET_W}x${SHEET_H}in`);
})();
