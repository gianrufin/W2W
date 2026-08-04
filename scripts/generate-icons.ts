/**
 * App icon generator.
 *
 *   npm run icons
 *
 * The installed-app icon is the wordmark, set in **Space Grotesk** — the same
 * typeface as the app itself. It was previously drawn in Inter, so the icon on
 * a home screen did not match the header it opened into.
 *
 * The font is fetched from Google Fonts and inlined into the SVG as base64.
 * That matters for two reasons: the SVG in `public/icons/` is served to
 * browsers and must not depend on a network font to render correctly, and the
 * rasteriser must not silently fall back to a system face and produce an icon
 * in the wrong typeface without saying so.
 *
 * Rasterising is done by Chromium via Playwright rather than a native image
 * library, because that is the renderer whose text layout we already trust —
 * it is the one drawing the header.
 *
 * Outputs, all under public/icons/:
 *   icon.svg              the source, self-contained
 *   icon-192/512.png      standard
 *   maskable-192/512.png  safe-zone padded for Android adaptive icons
 *   apple-touch-icon.png  180px, opaque, iOS applies its own rounding
 */

import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const OUT = 'public/icons';

const FONT_CSS =
  'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@700&display=swap';

/** Marquee gold, matching `--grad-brand` in the dark theme. */
const BRAND_FROM = '#FFCD5C';
const BRAND_TO = '#E67E22';
const INK = '#000000';
/** The wordmark sits *on* the gold, so it is dark — white on amber is unreadable. */
const ON_BRAND = '#261800';

/**
 * Android crops a maskable icon to an unpredictable shape and guarantees only
 * the centre 80% survives. The wordmark is therefore drawn smaller on those,
 * with the gradient bled to the full square so no corner shows background.
 */
const MASKABLE_SAFE_SCALE = 0.62;

async function main() {
  await mkdir(OUT, { recursive: true });

  const fontDataUri = await fetchFontDataUri();

  const standard = buildSvg(fontDataUri, { rounded: true, scale: 1 });
  const maskable = buildSvg(fontDataUri, { rounded: false, scale: MASKABLE_SAFE_SCALE });
  const apple = buildSvg(fontDataUri, { rounded: false, scale: 1 });

  await writeFile(path.join(OUT, 'icon.svg'), standard, 'utf8');

  const browser = await chromium.launch();
  try {
    await rasterise(browser, standard, 192, path.join(OUT, 'icon-192.png'));
    await rasterise(browser, standard, 512, path.join(OUT, 'icon-512.png'));
    await rasterise(browser, maskable, 192, path.join(OUT, 'maskable-192.png'));
    await rasterise(browser, maskable, 512, path.join(OUT, 'maskable-512.png'));
    // iOS ignores transparency and applies its own mask, so this one is square
    // and fully bled.
    await rasterise(browser, apple, 180, path.join(OUT, 'apple-touch-icon.png'));
  } finally {
    await browser.close();
  }

  console.log(`Wrote 5 PNGs and icon.svg to ${OUT}/`);
}

/**
 * Download the Space Grotesk woff2 and return it as a data URI.
 *
 * Google serves a different file per unicode subset; the `latin` block is the
 * one carrying W and 2. Requesting with a modern browser UA is what makes
 * Google return woff2 rather than a legacy format.
 */
async function fetchFontDataUri(): Promise<string> {
  const css = await (
    await fetch(FONT_CSS, {
      headers: {
        'user-agent':
          'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) ' +
          'Chrome/122.0.0.0 Safari/537.36',
      },
    })
  ).text();

  // Blocks are emitted subset-by-subset with a comment naming each; take the
  // one commented /* latin */ rather than whichever happens to be last.
  const latin = css.split('/* latin */')[1];
  const url = /src:\s*url\((https:[^)]+\.woff2)\)/.exec(latin ?? '')?.[1];
  if (!url) throw new Error('Could not find the latin woff2 in the Google Fonts CSS');

  const font = Buffer.from(await (await fetch(url)).arrayBuffer());
  return `data:font/woff2;base64,${font.toString('base64')}`;
}

function buildSvg(
  fontDataUri: string,
  { rounded, scale }: { rounded: boolean; scale: number },
): string {
  const size = 512;
  // Material's 22.9% corner radius, the same curve the app uses on its chips.
  const radius = rounded ? 117.76 : 0;
  const fontSize = 150 * scale;
  // Optical centring: "W2W" has no descenders, so mathematical centring sits
  // visually low. Nudging up by ~3% of the cap height fixes it.
  const baselineY = size / 2 + fontSize * 0.34;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="brand" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${BRAND_FROM}"/>
      <stop offset="100%" stop-color="${BRAND_TO}"/>
    </linearGradient>
    <style>
      @font-face {
        font-family: 'Space Grotesk';
        font-style: normal;
        font-weight: 700;
        src: url(${fontDataUri}) format('woff2');
      }
    </style>
  </defs>
  <rect width="${size}" height="${size}" rx="${radius}" fill="url(#brand)"/>
  <text x="${size / 2}" y="${baselineY}"
        font-family="Space Grotesk" font-weight="700" font-size="${fontSize}"
        letter-spacing="-8" fill="${ON_BRAND}" text-anchor="middle">W2W</text>
</svg>`;
}

async function rasterise(
  browser: Awaited<ReturnType<typeof chromium.launch>>,
  svg: string,
  size: number,
  outPath: string,
): Promise<void> {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(
    `<style>html,body{margin:0;padding:0;background:${INK}}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`,
    { waitUntil: 'load' },
  );
  // The face is inlined, so this resolves immediately — but waiting makes a
  // fallback-font render impossible rather than merely unlikely.
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: outPath, omitBackground: false });
  await page.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
