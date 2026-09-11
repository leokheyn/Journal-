/**
 * Shared font embedding.
 *
 * Google Fonts is unreachable from this environment, so any headless render
 * of a roundup page falls back to a generic serif unless the real faces are
 * inlined. Fallback metrics are wider and taller than the real ones, so a
 * layout that fits under the fallback can still overflow in print — which is
 * why both the PDF writer and the fit checker embed fonts the same way.
 */

const fs = require("fs");
const path = require("path");

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
  const missing = [];
  for (const [family, pkg, weight, style] of FACES) {
    const file = path.join(modulesDir, "@fontsource", pkg, "files",
      `${pkg}-latin-${weight}-${style}.woff2`);
    if (!fs.existsSync(file)) { missing.push(path.basename(file)); continue; }
    const b64 = fs.readFileSync(file).toString("base64");
    out.push(`@font-face{font-family:"${family}";font-style:${style};font-weight:${weight};` +
             `font-display:block;src:url(data:font/woff2;base64,${b64}) format("woff2");}`);
  }
  if (missing.length) {
    throw new Error("missing font files (run `npm install`): " + missing.join(", "));
  }
  return out.join("\n");
}

/** The page with its unreachable Google Fonts link swapped for real faces. */
function withRealFonts(src, modulesDir) {
  return {
    css: fontFaces(modulesDir),
    html: src.replace(/<link[^>]*fonts\.(googleapis|gstatic)\.com[^>]*>/g, ""),
  };
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

module.exports = { fontFaces, withRealFonts, findChromium, FACES };
