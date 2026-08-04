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
  // Ayala — the prize. Runs on Vista Connect (WSVistaWebClient); the films
  // endpoint answers 401 without a global JWT, so we need the headers the web
  // app actually sends, plus whatever fires when a cinema is opened.
  { id: 'ayala-home', url: 'https://www.ayalaallaccess.com' },
  { id: 'ayala-cinemas', url: 'https://www.ayalaallaccess.com/cinemas' },
  { id: 'ayala-movies', url: 'https://www.ayalaallaccess.com/movies' },
  { id: 'ayala-showtimes', url: 'https://www.ayalaallaccess.com/showtimes' },

  // Robinsons — a plain JSON webservice, but it 404s outside a browser
  // session. Capture the exact method, headers and body.
  { id: 'robinsons', url: 'https://www.robinsonsmovieworld.com' },
  { id: 'robinsons-schedule', url: 'https://robinsonsmovieworld.com/cinema/schedule' },

  // SM — a Next.js app. The schedule must arrive via an API or RSC payload;
  // the first pass only saw JS chunks.
  { id: 'sm-home', url: 'https://www.smcinema.com' },
  { id: 'sm-movies', url: 'https://www.smcinema.com/movies' },
  { id: 'sm-cinemas', url: 'https://www.smcinema.com/cinemas' },

  // Vista — ASP.NET MVC serving HTML partials. /showtimes is a 404; the real
  // entry points look like /Home/MovieSelector.
  { id: 'vista-home', url: 'https://www.vistacinemas.com.ph' },
  { id: 'vista-movieselector', url: 'https://www.vistacinemas.com.ph/Home/MovieSelector' },

  // Indie / festival tier — all WordPress. Cinemalaya runs Modern Events
  // Calendar, which has its own AJAX interface worth capturing.
  { id: 'cinema76', url: 'https://www.cinema76.ph' },
  { id: 'centenario', url: 'https://cinemacentenario.com' },
  { id: 'cinemalaya', url: 'https://www.cinemalaya.org' },
  { id: 'cinemalaya-events', url: 'https://www.cinemalaya.org/events' },
  { id: 'qcinema', url: 'https://qcinema.ph' },
  { id: 'fdcp', url: 'https://www.fdcp.ph' },
];

/**
 * A data call, captured completely enough to replay outside a browser.
 *
 * The first recon pass only recorded URLs, which turned out to be useless on
 * its own: Ayala's films endpoint answers 401 "No global authentication JWT
 * supplied" and Robinsons' webservice 404s outside a session. The interesting
 * part is the headers and the body, so those are what we keep.
 */
interface DataCall {
  url: string;
  method: string;
  status: number;
  type: string;
  /** Auth/session/content headers only — never the whole set. */
  requestHeaders: Record<string, string>;
  postData?: string;
  /** Where the response body was written, when it was JSON. */
  bodyFile?: string;
  bodyPreview?: string;
}

interface Capture {
  id: string;
  requestedUrl: string;
  finalUrl?: string;
  status?: number;
  title?: string;
  htmlBytes?: number;
  dataRequests: DataCall[];
  error?: string;
}

/** Headers that determine whether a call can be replayed. */
const HEADERS_OF_INTEREST = [
  'authorization',
  'connect-token',
  'ocp-apim-subscription-key',
  'x-api-key',
  'x-requested-with',
  'content-type',
  'accept',
  'origin',
  'referer',
  'cookie',
];

function interestingHeaders(all: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(all)) {
    const key = k.toLowerCase();
    if (HEADERS_OF_INTEREST.includes(key) || key.startsWith('x-')) {
      // Cookies and tokens are captured truncated: enough to see the shape and
      // which header carries it, not enough to be a credential in the artifact.
      out[key] = v.length > 120 ? `${v.slice(0, 120)}…[${v.length} chars]` : v;
    }
  }
  return out;
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const captures: Capture[] = [];

  let bodyIndex = 0;
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
      bodyIndex = 0;
      const capture: Capture = { id: target.id, requestedUrl: target.url, dataRequests: [] };
      const page = await context.newPage();

      page.on('response', async (response) => {
        const url = response.url();
        const type = (response.headers()['content-type'] ?? '').split(';')[0];
        const isJson = /json/i.test(type);
        const looksLikeData = /api|schedule|showtime|session|webservice|film/i.test(url);
        if (!isJson && !looksLikeData) return;
        if (/\.(png|jpe?g|gif|svg|webp|woff2?|css|ico)(\?|$)/i.test(url)) return;
        // Skip third-party analytics — they are noise, not schedule data.
        if (/google-analytics|doubleclick|facebook|tiktok|adtrafficquality|recaptcha/i.test(url))
          return;

        const request = response.request();
        const call: DataCall = {
          url,
          method: request.method(),
          status: response.status(),
          type,
          requestHeaders: interestingHeaders(await request.allHeaders().catch(() => ({}))),
          postData: request.postData() ?? undefined,
        };

        if (isJson) {
          try {
            const body = await response.text();
            const name = `${target.id}--${String(bodyIndex++).padStart(2, '0')}.json`;
            await writeFile(path.join(OUT, name), body, 'utf-8');
            call.bodyFile = name;
            call.bodyPreview = body.slice(0, 400);
          } catch {
            // Body already consumed or the request was aborted.
          }
        }

        capture.dataRequests.push(call);
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

  console.log('\n--- data calls (method, auth headers, body file) ---');
  for (const c of captures) {
    if (!c.dataRequests.length) continue;
    console.log(`\n### ${c.id}`);
    for (const r of c.dataRequests.slice(0, 20)) {
      console.log(`  ${r.method} ${r.status} ${r.url.slice(0, 130)}`);
      const headerKeys = Object.keys(r.requestHeaders).filter(
        (k) => !['accept', 'content-type', 'referer', 'origin'].includes(k),
      );
      if (headerKeys.length) {
        for (const k of headerKeys) console.log(`      ${k}: ${r.requestHeaders[k]}`);
      }
      if (r.postData) console.log(`      body: ${r.postData.slice(0, 200)}`);
      if (r.bodyFile) console.log(`      -> ${r.bodyFile}  ${r.bodyPreview?.slice(0, 160)}`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
