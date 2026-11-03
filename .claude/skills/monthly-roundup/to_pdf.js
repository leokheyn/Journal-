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
    options: { in: { type: "string", multiple: true }, out: { type: "string" },
               modules: { type: "string" } },
  }).values;
  const inputs = args.in || [];
  if (!inputs.length || !args.out) {
    console.error("usage: to_pdf.js --in <page.html> [--in <page2.html>] --out <out.pdf>");
    process.exit(1);
  }
  if (inputs.length > 2) {
    console.error("at most two pages fit a Letter sheet at 5x7in");
    process.exit(1);
  }

  const modulesDir = args.modules || path.join(ROOT, "node_modules");
  const faces = fontFaces(modulesDir);

  /* ---- two pages, imposed side by side on a landscape sheet ---------------
     Each page goes in its own iframe. Two of these documents cannot share one
     DOM: they both carry a #page and a script that reaches for it, so the
     second page's script would lay out the first. Separate frames keep each
     page's script talking to its own page. */
  if (inputs.length === 2) {
    const SH_W = 11, SH_H = 8.5, GAP = 0.4;
    const left = (SH_W - PAGE_W * 2 - GAP) / 2;        // 0.3in
    const top = (SH_H - PAGE_H) / 2;                   // 0.75in
    const xs = [left, left + PAGE_W + GAP];

    const frames = inputs.map((file, i) => {
      const body = fs.readFileSync(file, "utf8")
        .replace(/<link[^>]*fonts\.(googleapis|gstatic)\.com[^>]*>/g, "");
      const doc = `<!doctype html><html><head><meta charset="utf-8"><style>
${faces}
html,body{margin:0;padding:0;width:${PAGE_W}in;height:${PAGE_H}in;background:#fff;overflow:hidden}
img{max-width:100%}
.chrome{display:none!important}
.stage-wrap{display:block!important;position:absolute!important;left:0!important;top:0!important;
            width:${PAGE_W}in!important;height:${PAGE_H}in!important}
.stage{transform:none!important}
.page{box-shadow:none!important;margin:0!important}
</style></head><body>${body}</body></html>`;
      const f = args.out.replace(/\.pdf$/, "") + `.frame${i + 1}.html`;
      fs.writeFileSync(f, doc);
      return f;
    });

    /* one set of marks per trimmed card, sitting in the sheet's own margins */
    const GAPM = 0.05, LEN = 0.16;
    let marks = "";
    for (const x of xs) {
      const R = x + PAGE_W, B = top + PAGE_H;
      for (const [mx, my, sx, sy] of [[x, top, -1, -1], [R, top, 1, -1], [x, B, -1, 1], [R, B, 1, 1]]) {
        marks += `<div class="cm cm-h" style="left:${(sx < 0 ? mx - GAPM - LEN : mx + GAPM)}in;top:${my}in;width:${LEN}in"></div>`;
        marks += `<div class="cm cm-v" style="left:${mx}in;top:${(sy < 0 ? my - GAPM - LEN : my + GAPM)}in;height:${LEN}in"></div>`;
      }
    }

    const sheet = `<!doctype html><html><head><meta charset="utf-8"><style>
@page{ size:${SH_W}in ${SH_H}in; margin:0; }
html,body{ margin:0; padding:0; width:${SH_W}in; height:${SH_H}in; background:#fff; }
iframe{ position:absolute; border:0; width:${PAGE_W}in; height:${PAGE_H}in; }
.cm{ position:absolute; }
.cm-h{ border-top:0.4pt solid #8A8A8A; height:0; }
.cm-v{ border-left:0.4pt solid #8A8A8A; width:0; }
#lbl{ position:absolute; left:0; right:0; bottom:0.22in; text-align:center;
      font:7pt "Courier Prime", monospace; letter-spacing:.18em; color:#9A9A9A;
      text-transform:uppercase; }
</style></head><body>
${frames.map((f, i) => `<iframe src="file://${path.resolve(f)}" style="left:${xs[i]}in;top:${top}in"></iframe>`).join("")}
${marks}
<div id="lbl">trim each to 5 &times; 7 in along the corner marks</div>
</body></html>`;

    const sheetFile = args.out.replace(/\.pdf$/, "") + ".sheet.html";
    fs.writeFileSync(sheetFile, sheet);

    const exe0 = findChromium();
    const { chromium: cr } = require("playwright-core");
    const br = await cr.launch(exe0 ? { executablePath: exe0 } : {});
    const pg = await br.newPage();
    const probs = [];
    pg.on("pageerror", e => probs.push(String(e.message)));
    await pg.goto("file://" + path.resolve(sheetFile), { waitUntil: "load" });
    for (const fr of pg.frames()) {
      try { await fr.evaluate(() => document.fonts.ready); } catch (e) {}
    }
    await pg.waitForTimeout(600);
    await pg.pdf({ path: args.out, printBackground: true, preferCSSPageSize: true });
    await br.close();
    if (!process.env.KEEP_PRINT_HTML) {
      fs.unlinkSync(sheetFile);
      frames.forEach(f => fs.unlinkSync(f));
    }
    if (probs.length) console.error("  ! page errors:", probs.join("; "));
    console.log(`  wrote ${args.out} (${Math.round(fs.statSync(args.out).size / 1024)} KB) — ` +
                `two ${PAGE_W}x${PAGE_H}in pages on ${SH_W}x${SH_H}in landscape`);
    return;
  }

  let src = fs.readFileSync(inputs[0], "utf8");

  /* drop the Google Fonts link — it cannot be reached, and a silent fallback
     is worse than an obvious failure */
  src = src.replace(/<link[^>]*fonts\.(googleapis|gstatic)\.com[^>]*>/g, "");

  const doc = `<!doctype html><html><head><meta charset="utf-8">
<style>
${faces}
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
