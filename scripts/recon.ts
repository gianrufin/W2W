/**
 * Scraper reconnaissance.
 *
 * The first live run produced four silent zeros: the pages loaded but nothing
 * matched. That is what guessing at URLs and selectors gets you. Rather than
 * guess again, this script visits each target from a runner that can actually
 * reach them and records what is really there:
 *
 *   - the final URL after redirects, and the HTTP status
 *   - the rendered HTML (post-JS, which is what the selectors run against)
 *   - every XHR/fetch the page made, with content types — this is where a
 *     client-rendered schedule actually comes from
 *   - a full-page screenshot, to see at a glance whether we got a real page,
 *     a bot wall, or a 404
 *
 * Output lands in recon-output/ and is uploaded as a workflow artifact.
 *
 *   npm run recon
 */

import { chromium, type Browser } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const OUT = 'recon-output';

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

function today(): string {
  return new Date(Date.now() + 8 * 3_600_000).toISOString().slice(0, 10);
}

interface Target {
  id: string;
  url: string;
  /** Wait for this selector before capturing, if the schedule renders late. */
  waitFor?: string;
}

const TARGETS: Target[] = [
  // SM — reachable from Actions. Find where the schedule actually lives.
  { id: 'sm-home', url: 'https://www.smcinema.com' },
  { id: 'sm-schedules', url: `https://www.smcinema.com/schedules?date=${today()}` },
  { id: 'sm-movies', url: 'https://www.smcinema.com/movies' },

  // Ayala — sureseats.com is dead (TLS name mismatch). Ayala All Access is the
  // current booking property.
  { id: 'ayala-home', url: 'https://www.ayalaallaccess.com' },
  { id: 'ayala-cinemas', url: 'https://www.ayalaallaccess.com/cinemas' },
  { id: 'ayala-schedules', url: 'https://www.ayalaallaccess.com/schedules' },

  // Vista — reachable, but the selectors found nothing.
  { id: 'vista-home', url: 'https://www.vistacinemas.com.ph' },
  { id: 'vista-showtimes', url: 'https://www.vistacinemas.com.ph/showtimes' },

  // Robinsons — never had a scraper; worth knowing what it serves.
  { id: 'robinsons', url: 'https://www.robinsonsmovieworld.com' },

  // Indie / festival tier.
  { id: 'cinema76', url: 'https://www.cinema76.ph' },
  { id: 'centenario', url: 'https://www.cinemacentenario.com' },
  { id: 'cinemalaya', url: 'https://www.cinemalaya.org' },
  { id: 'qcinema', url: 'https://qcinema.ph' },
  { id: 'fdcp', url: 'https://www.fdcp.ph' },
];

interface Capture {
  id: string;
  requestedUrl: string;
  finalUrl?: string;
  status?: number;
  title?: string;
  htmlBytes?: number;
  /** Requests that look like they carry data rather than assets. */
  dataRequests: Array<{ url: string; status: number; type: string }>;
  error?: string;
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const captures: Capture[] = [];

  let browser: Browser | null = null;
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      userAgent: UA,
      locale: 'en-PH',
      timezoneId: 'Asia/Manila',
      viewport: { width: 1440, height: 1000 },
      // A cert-name mismatch should not stop us from seeing the page.
      ignoreHTTPSErrors: true,
    });

    for (const target of TARGETS) {
      const capture: Capture = { id: target.id, requestedUrl: target.url, dataRequests: [] };
      const page = await context.newPage();

      page.on('response', (response) => {
        const url = response.url();
        const type = response.headers()['content-type'] ?? '';
        // JSON, or anything that smells like a schedule endpoint.
        if (/json/i.test(type) || /api|schedule|showtime|session|cinema/i.test(url)) {
          if (!/\.(png|jpe?g|gif|svg|webp|woff2?|css|ico)(\?|$)/i.test(url)) {
            capture.dataRequests.push({ url, status: response.status(), type: type.split(';')[0] });
          }
        }
      });

      try {
        const response = await page.goto(target.url, {
          waitUntil: 'domcontentloaded',
          timeout: 45_000,
        });
        capture.status = response?.status();

        if (target.waitFor) {
          await page.waitForSelector(target.waitFor, { timeout: 10_000 }).catch(() => {});
        }
        // Let client-rendered schedules settle and their XHRs fire.
        await page.waitForTimeout(6_000);

        capture.finalUrl = page.url();
        capture.title = await page.title();

        const html = await page.content();
        capture.htmlBytes = html.length;
        await writeFile(path.join(OUT, `${target.id}.html`), html, 'utf-8');
        await page
          .screenshot({ path: path.join(OUT, `${target.id}.png`), fullPage: false })
          .catch(() => {});
      } catch (err) {
        capture.error = (err as Error).message.split('\n')[0];
      }

      captures.push(capture);
      console.log(
        `${target.id.padEnd(20)} ${String(capture.status ?? '---').padEnd(4)} ` +
          `${String(capture.htmlBytes ?? 0).padEnd(8)} ${capture.dataRequests.length} data reqs` +
          (capture.error ? `  ERROR ${capture.error}` : ''),
      );
      await page.close();
    }

    await context.close();
  } finally {
    await browser?.close();
  }

  await writeFile(path.join(OUT, 'summary.json'), JSON.stringify(captures, null, 2), 'utf-8');

  console.log('\n--- data-bearing requests per target ---');
  for (const c of captures) {
    if (!c.dataRequests.length) continue;
    console.log(`\n${c.id}:`);
    for (const r of c.dataRequests.slice(0, 15)) {
      console.log(`  ${r.status} ${r.type.padEnd(18)} ${r.url.slice(0, 140)}`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
