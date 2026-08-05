import { chromium } from 'playwright';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { spaceGroteskCss } from './font.mjs';

const OUT = 'marketing-out/W2W-facebook-launch';
const IMG = `${OUT}/images`;
await mkdir(IMG, { recursive: true });

const FONT = await spaceGroteskCss();
const shot = async (n) => `data:image/png;base64,${(await readFile(`marketing-out/app-${n}.png`)).toString('base64')}`;
const [MAP, LIST, VENUE] = await Promise.all([shot('map'), shot('list'), shot('venue')]);

/* Shared shell. Same tokens as the app so the posts and the product are
   visibly one thing: true black, marquee gold, violet counterweight. */
const BASE = `
<style>
${FONT}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Space Grotesk',sans-serif;background:#000;color:#F5F0E7;-webkit-font-smoothing:antialiased;overflow:hidden}
.stage{position:relative;overflow:hidden;background:#000}
.stage::before{content:'';position:absolute;inset:0;
  background:radial-gradient(60% 45% at 88% -8%, rgba(255,182,39,.20), transparent 70%),
             radial-gradient(55% 42% at 2% 106%, rgba(139,92,246,.16), transparent 70%);}
.in{position:relative;z-index:2;height:100%;display:flex;flex-direction:column}
.gold{background:linear-gradient(135deg,#FFCD5C,#FFB627 45%,#E67E22);-webkit-background-clip:text;background-clip:text;color:transparent}
.violet{background:linear-gradient(135deg,#C6B0FF,#8B5CF6);-webkit-background-clip:text;background-clip:text;color:transparent}
.eyebrow{font-weight:500;letter-spacing:.34em;text-transform:uppercase;color:#FFB627;font-size:22px}
h1{font-weight:700;letter-spacing:-.035em;line-height:.98}
.sub{color:#A69D8E;font-weight:400;line-height:1.45}
.chip{display:inline-flex;align-items:center;gap:14px;border:1px solid #332D25;background:#141110;border-radius:999px;padding:16px 28px;font-weight:500}
.card{background:#141110;border:1px solid #332D25;border-radius:32px;padding:34px}
.logo{width:96px;height:96px;border-radius:26px;background:linear-gradient(135deg,#FFCD5C,#FFB627 45%,#E67E22);
  color:#261800;font-weight:700;font-size:28px;letter-spacing:-.04em;display:grid;place-items:center;
  box-shadow:0 10px 40px -10px rgba(255,182,39,.6)}
.wm{position:absolute;bottom:44px;left:64px;z-index:3;display:flex;align-items:center;gap:16px;color:#A69D8E;font-size:24px;font-weight:500}
.wmk{width:44px;height:44px;border-radius:13px;background:linear-gradient(135deg,#FFCD5C,#E67E22);color:#261800;font-weight:700;font-size:14px;display:grid;place-items:center;letter-spacing:-.04em}

/* Device render: aluminium rail, glass, and a highlight raking across it. */
.phone{position:relative;border-radius:58px;background:linear-gradient(150deg,#4a443c,#17150f 22%,#0a0908 55%,#2b2721 88%,#5a5249);
  padding:11px;box-shadow:0 60px 120px -30px rgba(0,0,0,.95),0 0 90px -20px rgba(255,182,39,.28),inset 0 0 0 1px rgba(255,255,255,.10)}
.phone::after{content:'';position:absolute;inset:0;border-radius:58px;pointer-events:none;
  background:linear-gradient(115deg,rgba(255,255,255,.16) 0%,transparent 26%,transparent 68%,rgba(255,255,255,.07) 100%)}
.screen{position:relative;border-radius:48px;overflow:hidden;background:#000;display:block}
.screen img{display:block;width:100%;height:100%;object-fit:cover;object-position:top}
.notch{position:absolute;top:13px;left:50%;transform:translateX(-50%);width:104px;height:30px;border-radius:16px;background:#000;z-index:4}
.glare{position:absolute;inset:0;z-index:3;pointer-events:none;
  background:linear-gradient(118deg,rgba(255,255,255,.13) 0%,rgba(255,255,255,.03) 16%,transparent 34%)}
</style>`;

const wordmark = `<div class="wm"><span class="wmk">W2W</span><span>gianrufin.github.io/W2W — free, no app store</span></div>`;

/* ---- 1. Hero, portrait: the device, angled, with the real venue screen ---- */
const hero = (w, h, src, headline, sub) => `${BASE}
<div class="stage" style="width:${w}px;height:${h}px">
 <div class="in" style="padding:${h > 1200 ? 96 : 78}px 84px">
  <div style="display:flex;align-items:center;gap:26px">
    <div class="logo">W2W</div>
    <div class="eyebrow" style="font-size:20px">Where · When · What 2 Watch</div>
  </div>
  <h1 style="font-size:${h > 1200 ? 92 : 78}px;margin-top:${h > 1200 ? 48 : 30}px;max-width:600px">${headline}</h1>
  <p class="sub" style="font-size:28px;margin-top:24px;max-width:540px">${sub}</p>
  <div style="position:absolute;right:-118px;bottom:${h > 1200 ? -150 : -190}px;transform:rotate(-8deg)">
    <div class="phone" style="width:498px">
      <div class="screen" style="height:1020px"><div class="notch" style="width:88px;height:25px;top:11px"></div><div class="glare"></div><img src="${src}"></div>
    </div>
  </div>
  <!-- Pull the one number out of the screenshot, at a size that survives a feed. -->
  <div class="card" style="position:absolute;left:84px;bottom:${h > 1200 ? 210 : 150}px;width:470px;padding:30px 32px">
    <div class="eyebrow" style="font-size:15px">Showtime 12:30 PM</div>
    <div style="font-weight:700;font-size:52px;letter-spacing:-.035em;margin-top:12px" class="gold">Leave by 12:01</div>
    <div class="sub" style="font-size:22px;margin-top:10px">7 min drive · incl. 32 min to park,<br>queue &amp; get seated</div>
  </div>
  <!-- Keeps the copy legible where the device passes behind it. -->
  <div style="position:absolute;left:0;top:0;width:660px;height:100%;z-index:-1;
    background:linear-gradient(90deg,#000 55%,rgba(0,0,0,.86) 78%,transparent)"></div>
 </div>
 ${wordmark}
</div>`;

/* ---- 2. Feature grid ---- */
const feat = (icon, title, body, accent) => `
  <div class="card" style="display:flex;gap:24px;align-items:flex-start">
    <div style="font-size:44px;line-height:1">${icon}</div>
    <div><div style="font-weight:700;font-size:34px;letter-spacing:-.02em;color:${accent}">${title}</div>
    <div class="sub" style="font-size:25px;margin-top:8px">${body}</div></div>
  </div>`;

const features = `${BASE}
<div class="stage" style="width:1080px;height:1080px">
 <div class="in" style="padding:76px 72px">
  <div class="eyebrow">Everything, in one map</div>
  <h1 style="font-size:76px;margin-top:22px">Every cinema.<br><span class="gold">One search.</span></h1>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:46px">
    ${feat('🎬', 'All the chains', 'SM, Ayala, Robinsons, Vista, Megaworld — live showtimes, not a directory.', '#FFB627')}
    ${feat('🎞️', 'Indie &amp; festivals', 'Cinema 76, Power Plant, cinematheques, Cinemalaya, QCinema, MMFF.', '#B294FF')}
    ${feat('📍', 'Nearest, not loudest', 'Sorted by distance from where you actually are.', '#FFB627')}
    ${feat('🔊', 'Know the room', 'IMAX, Dolby Atmos, VIP and 4DX flagged before you book.', '#96B2D0')}
  </div>
  <div style="display:flex;gap:16px;margin-top:44px;flex-wrap:wrap">
    <span class="chip" style="font-size:25px">🇵🇭 Nationwide</span>
    <span class="chip" style="font-size:25px">⚡ Updated daily</span>
    <span class="chip" style="font-size:25px">🆓 Free forever</span>
  </div>
 </div>
 ${wordmark}
</div>`;

/* ---- 3. Leave by ---- */
const rows = [
  ['Drive there', 'live traffic for your departure hour', ''],
  ['Park the car', 'the Friday-night spiral up six levels', '10 min'],
  ['Walk in', 'basement lift to the top-floor cinema', '6 min'],
  ['Ticket counter', 'the queue you always underestimate', '5 min'],
  ['Popcorn', 'the real reason people miss the opening', '8 min'],
  ['Find your seat', 'in the dark, apologising', '3 min'],
].map(([t, s, m]) => `
  <div style="display:flex;align-items:center;gap:22px;padding:19px 0;border-bottom:1px solid #241F1A">
    <div style="flex:1"><div style="font-weight:700;font-size:30px;letter-spacing:-.02em">${t}</div>
      <div class="sub" style="font-size:21px;margin-top:3px">${s}</div></div>
    <div style="font-weight:700;font-size:31px;color:${m ? '#FFB627' : '#5C5449'}">${m || '↔'}</div>
  </div>`).join('');

const leaveBy = `${BASE}
<div class="stage" style="width:1080px;height:1350px">
 <div class="in" style="padding:88px 76px">
  <div class="eyebrow">The feature nobody else has</div>
  <h1 style="font-size:88px;margin-top:22px"><span class="gold">Leave by</span><br>6:42 PM.</h1>
  <p class="sub" style="font-size:30px;margin-top:24px">Not "it's a 20-minute drive." Every cinema app stops<br>measuring at the car park. Yours shouldn't.</p>
  <div class="card" style="margin-top:36px;padding:8px 34px 22px">${rows}
    <div style="display:flex;align-items:center;gap:22px;padding-top:24px">
      <div style="flex:1;font-weight:700;font-size:34px;letter-spacing:-.02em">Built into every showtime</div>
      <div style="font-weight:700;font-size:38px" class="gold">+32 min</div>
    </div>
  </div>
 </div>
 ${wordmark}
</div>`;

/* ---- 4. Install ---- */
const step = (n, t, s) => `
  <div style="display:flex;gap:26px;align-items:flex-start;margin-bottom:26px">
    <div style="width:64px;height:64px;flex:none;border-radius:20px;background:linear-gradient(135deg,#FFCD5C,#E67E22);color:#261800;
      font-weight:700;font-size:30px;display:grid;place-items:center">${n}</div>
    <div><div style="font-weight:700;font-size:34px;letter-spacing:-.02em">${t}</div>
      <div class="sub" style="font-size:25px;margin-top:5px">${s}</div></div>
  </div>`;

const install = `${BASE}
<div class="stage" style="width:1080px;height:1350px">
 <div class="in" style="padding:88px 76px">
  <div class="eyebrow">No app store. No download.</div>
  <h1 style="font-size:82px;margin-top:22px">Install it in<br><span class="gold">ten seconds.</span></h1>
  <p class="sub" style="font-size:29px;margin-top:22px">It's a website that installs like an app — and opens offline.</p>
  <div style="margin-top:52px">
    ${step(1, 'Open the site', 'gianrufin.github.io/W2W &mdash; Chrome or Safari on your phone.')}
    ${step(2, 'Tap the menu', 'Share on iPhone. The ⋮ dots on Android.')}
    ${step(3, 'Add to Home Screen', "That&rsquo;s it. Icon on your home screen, full screen, no browser bar.")}
  </div>
  <div class="card" style="margin-top:14px;display:flex;gap:26px;align-items:center">
    <div class="logo" style="width:82px;height:82px;border-radius:22px;font-size:24px">W2W</div>
    <div><div style="font-weight:700;font-size:30px">Zero storage. Zero updates.</div>
    <div class="sub" style="font-size:24px;margin-top:4px">Always the latest showtimes, every time you open it.</div></div>
  </div>
  <div style="position:absolute;right:-46px;bottom:-530px;transform:rotate(-7deg)">
    <div class="phone" style="width:430px">
      <div class="screen" style="height:880px"><div class="notch" style="width:76px;height:22px;top:10px"></div><div class="glare"></div><img src="${MAP}"></div>
    </div>
  </div>
 </div>
 ${wordmark}
</div>`;

/* ---- 5. Link/share card ---- */
const cover = `${BASE}
<div class="stage" style="width:1200px;height:630px">
 <div class="in" style="padding:64px 68px;flex-direction:row;align-items:center;gap:40px">
  <div style="flex:1">
    <div style="display:flex;align-items:center;gap:20px"><div class="logo" style="width:74px;height:74px;border-radius:20px;font-size:22px">W2W</div>
      <div class="eyebrow" style="font-size:17px">Where · When · What 2 Watch</div></div>
    <h1 style="font-size:74px;margin-top:30px">Every cinema in<br>the Philippines.<br><span class="gold">One map.</span></h1>
    <p class="sub" style="font-size:25px;margin-top:20px">Live showtimes, indie &amp; festivals, and when to leave.</p>
  </div>
  <div style="position:relative;transform:rotate(-7deg) translateY(46px)">
    <div class="phone" style="width:330px">
      <div class="screen" style="height:672px"><div class="notch" style="width:60px;height:18px;top:8px"></div><div class="glare"></div><img src="${MAP}"></div>
    </div>
  </div>
 </div>
</div>`;

const jobs = [
  ['01-hero-portrait.png', 1080, 1350, hero(1080, 1350, VENUE, 'Know exactly<br>when to <span class="gold">leave.</span>', 'Live showtimes from every cinema in the country — and the one number that gets you in your seat before the lights go down.')],
  ['02-hero-square.png', 1080, 1080, hero(1080, 1080, LIST, 'Every cinema<br>near you. <span class="gold">Now.</span>', "49 cinemas and 876 showtimes within 15 km — sorted by how far they are from where you&rsquo;re standing.")],
  ['03-features.png', 1080, 1080, features],
  ['04-leave-by.png', 1080, 1350, leaveBy],
  ['05-install.png', 1080, 1350, install],
  ['06-link-card.png', 1200, 630, cover],
];

const b = await chromium.launch();
for (const [name, w, h, html] of jobs) {
  const page = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  await page.setContent(html, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(350);
  await page.screenshot({ path: `${IMG}/${name}` });
  await page.close();
  console.log('✓', name, `${w}×${h}`);
}
await b.close();

// The raw screens, for dropping into any hand-held mockup generator.
for (const [n, src] of [['map', MAP], ['list', LIST], ['venue', VENUE]]) {
  await writeFile(`${IMG}/screen-${n}.png`, Buffer.from(src.split(',')[1], 'base64'));
}
console.log('✓ 3 raw screens');
