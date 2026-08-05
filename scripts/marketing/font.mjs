import { ProxyAgent, fetch as ufetch } from 'undici';
const agent = new ProxyAgent(process.env.HTTPS_PROXY);
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';

/** Space Grotesk 400/500/700 latin, inlined so the renders need no network. */
export async function spaceGroteskCss() {
  const css = await (await ufetch(
    'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;700&display=swap',
    { headers: { 'user-agent': UA }, dispatcher: agent },
  )).text();
  const blocks = css.split('@font-face').slice(1);
  const out = [];
  for (const blk of blocks) {
    // The `latin` subset is the one carrying the characters we use.
    if (!/U\+0000-00FF/.test(blk)) continue;
    const url = blk.match(/url\((https:[^)]+)\)/)?.[1];
    const weight = blk.match(/font-weight:\s*(\d+)/)?.[1] ?? '400';
    if (!url) continue;
    const buf = Buffer.from(await (await ufetch(url, { dispatcher: agent })).arrayBuffer());
    out.push(`@font-face{font-family:'Space Grotesk';font-style:normal;font-weight:${weight};src:url(data:font/woff2;base64,${buf.toString('base64')}) format('woff2');}`);
  }
  return out.join('\n');
}
