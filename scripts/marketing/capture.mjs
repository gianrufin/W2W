import { chromium } from 'playwright';
import { ProxyAgent, fetch as ufetch } from 'undici';
import { mkdir } from 'node:fs/promises';
await mkdir('marketing-out', { recursive: true });
const agent = new ProxyAgent(process.env.HTTPS_PROXY);

const b = await chromium.launch();
const ctx = await b.newContext({
  viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, colorScheme: 'dark',
  locale: 'en-PH', timezoneId: 'Asia/Manila',
  geolocation: { latitude: 14.5547, longitude: 121.0244 }, permissions: ['geolocation'],
  // Stops the wordmark being caught mid-rotation with two words overlapping.
  reducedMotion: 'reduce',
});
await ctx.route(/^https:\/\//, async (route) => {
  const req = route.request();
  try {
    const r = await ufetch(req.url(), { method: req.method(), headers: req.headers(),
      body: ['GET','HEAD'].includes(req.method()) ? undefined : req.postData() ?? undefined, dispatcher: agent });
    await route.fulfill({ status: r.status,
      headers: { 'content-type': r.headers.get('content-type') ?? 'application/octet-stream', 'access-control-allow-origin': '*' },
      body: Buffer.from(await r.arrayBuffer()) });
  } catch { await route.abort(); }
});
const page = await ctx.newPage();
await page.addInitScript(() => {
  localStorage.setItem('w2w-theme', 'dark');
  localStorage.setItem('w2w-location-onboarded', 'true');
});
await page.goto('http://localhost:4173/', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(11000);
await page.screenshot({ path: 'marketing-out/app-map.png' });

await page.getByRole('button', { name: /view list/i }).click();
await page.waitForTimeout(2200);
await page.screenshot({ path: 'marketing-out/app-list.png' });

const named = page.getByRole('button', { name: /Glorietta|Greenbelt|Power Plant|Ayala|SM |Robinsons/i });
for (let i = 0; i < Math.min(8, await named.count()); i++) {
  const el = named.nth(i);
  const box = await el.boundingBox();
  if (!box || box.y < 260) continue;
  try { await el.click({ timeout: 4000 }); break; } catch {}
}
await page.waitForTimeout(3000);
await page.screenshot({ path: 'marketing-out/app-venue.png' });
console.log('captured 3');
await b.close();
