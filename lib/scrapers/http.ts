/**
 * Shared HTTP plumbing for the chain scrapers.
 *
 * None of the Philippine cinema portals publish an API. What they do publish is
 * the private endpoints their own front-ends call, and those have house rules
 * that cost a scrape run each when you learn them the hard way:
 *
 *   - Robinsons answers 404 to anything without `X-Requested-With:
 *     XMLHttpRequest`, and its load balancer needs the `SERVER` affinity cookie
 *     from a page visit first.
 *   - Robinsons and Megaworld both return JSON *inside* a JSON string, so the
 *     payload has to be parsed twice.
 *   - Both serialise timestamps as ASP.NET `/Date(1785904200000)/`.
 *
 * Everything here is plain fetch. Only the Vista Cloud token needs a browser;
 * the rest of the platform is reachable without one, which makes the scheduled
 * run an order of magnitude cheaper and far less brittle.
 */

/**
 * Route through HTTPS_PROXY if one is set.
 *
 * Node's fetch ignores the proxy environment variables that every other tool
 * honours, so behind a corporate or sandboxed egress `curl` succeeds and the
 * scraper gets a bot-wall 403 from the same host — which looks exactly like a
 * broken scraper and is not one. Opt-in and silent when unset, so a normal CI
 * runner is unaffected.
 */
function configureProxy(): void {
  const uri = process.env.HTTPS_PROXY ?? process.env.https_proxy;
  if (!uri) return;

  try {
    // Optional: undici ships inside Node, but importing it by name only works
    // where it is resolvable. A missing proxy is better than a crashed run.

    const { ProxyAgent, setGlobalDispatcher } = require('undici') as typeof import('undici');
    setGlobalDispatcher(new ProxyAgent({ uri }));
  } catch {
    // No undici on the resolution path — fall back to direct connections.
  }
}

configureProxy();

export const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

export interface HttpOptions {
  method?: 'GET' | 'POST';
  /** Extra headers merged over the browser-ish defaults. */
  headers?: Record<string, string>;
  /** Sent verbatim as the Cookie header. See {@link CookieJar}. */
  cookie?: string;
  timeoutMs?: number;
  /** Network failures and 5xx are retried; 4xx is not — it is an answer. */
  retries?: number;
}

/**
 * Minimal cookie jar.
 *
 * Only needs to survive one scrape run against one host, so this holds
 * name=value pairs and nothing else — no domain, path or expiry handling. The
 * one cookie that actually matters (Robinsons' `SERVER`) is a session-scoped
 * load-balancer pin, and treating it as opaque is exactly right.
 */
export class CookieJar {
  private readonly jar = new Map<string, string>();

  absorb(response: Response): void {
    // Undici exposes multiple Set-Cookie headers through getSetCookie().
    const raw =
      typeof response.headers.getSetCookie === 'function'
        ? response.headers.getSetCookie()
        : [response.headers.get('set-cookie') ?? ''];

    for (const line of raw) {
      const pair = line.split(';', 1)[0]?.trim();
      if (!pair) continue;
      const eq = pair.indexOf('=');
      if (eq > 0) this.jar.set(pair.slice(0, eq), pair.slice(eq + 1));
    }
  }

  get header(): string {
    return [...this.jar].map(([k, v]) => `${k}=${v}`).join('; ');
  }
}

/** Fetch with browser headers, a timeout and bounded retries. */
export async function httpFetch(url: string, options: HttpOptions = {}): Promise<Response> {
  const { method = 'GET', headers = {}, cookie, timeoutMs = 30_000, retries = 2 } = options;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    // Exponential backoff, skipped on the first try.
    if (attempt > 0) await sleep(500 * 2 ** (attempt - 1));

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        method,
        signal: controller.signal,
        // These hosts answer 411 to a POST with no Content-Length at all. An
        // empty body makes fetch emit `Content-Length: 0`; setting the header
        // by hand instead makes undici throw before the request is sent.
        ...(method === 'POST' ? { body: '' } : {}),
        headers: {
          'user-agent': BROWSER_UA,
          'accept-language': 'en-PH,en;q=0.9',
          ...(cookie ? { cookie } : {}),
          ...headers,
        },
      });

      // 4xx is a considered answer, not a hiccup — retrying just wastes time.
      if (response.status < 500) return response;
      lastError = new Error(`${url} → ${response.status}`);
    } catch (err) {
      lastError = err as Error;
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError ?? new Error(`${url} failed`);
}

/**
 * Fetch JSON, tolerating the double-encoded flavour Robinsons and Megaworld
 * emit: a JSON *string* whose contents are themselves JSON.
 */
export async function httpJson<T>(url: string, options: HttpOptions = {}): Promise<T> {
  const response = await httpFetch(url, options);
  if (!response.ok) throw new Error(`${url} → ${response.status}`);

  const text = await response.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    // An HTML error page where JSON was promised — usually a missing header.
    throw new Error(`${url} → non-JSON response (${text.slice(0, 80).replace(/\s+/g, ' ')})`);
  }

  if (typeof parsed === 'string') {
    try {
      return JSON.parse(parsed) as T;
    } catch {
      throw new Error(`${url} → string payload that is not JSON`);
    }
  }

  return parsed as T;
}

export async function httpText(url: string, options: HttpOptions = {}): Promise<string> {
  const response = await httpFetch(url, options);
  if (!response.ok) throw new Error(`${url} → ${response.status}`);
  return response.text();
}

/**
 * Parse an ASP.NET `/Date(1785904200000)/` value into an ISO string with the
 * Manila offset.
 *
 * The number is epoch milliseconds in UTC, so the instant is unambiguous; the
 * conversion here is purely about *presenting* it in +08:00, which is what the
 * rest of the pipeline stores and what a Filipino user reads off a poster.
 */
export function parseDotNetDate(value: string | null | undefined): string | null {
  const match = /\/Date\((-?\d+)([+-]\d{4})?\)\//.exec(value ?? '');
  if (!match) return null;

  const ms = Number(match[1]);
  if (!Number.isFinite(ms)) return null;

  // Shift into Manila wall-clock, format, then re-attach the offset.
  const manila = new Date(ms + 8 * 3_600_000).toISOString();
  return `${manila.slice(0, 19)}+08:00`;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Run `worker` over `items` with a bounded number in flight.
 *
 * The chain endpoints are single-server ASP.NET apps; hitting them with 40
 * parallel requests gets the run throttled or dropped. Four at a time keeps a
 * nationwide scrape inside the workflow's time budget without being rude.
 */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;

  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
    }
  });

  await Promise.all(runners);
  return results;
}
