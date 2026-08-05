# Marketing asset generator

Renders the social kit from the real app, so the images can never drift from the
product: `capture.mjs` drives a browser against a running build and screenshots
the actual states, `build.mjs` composes those into post-sized graphics using the
app's own tokens (true black, marquee gold, violet, Space Grotesk).

```bash
npm run build && npx serve out -l 4173   # in one terminal
node scripts/marketing/capture.mjs        # real screenshots → marketing-out/
node scripts/marketing/build.mjs          # post graphics + raw screens
```

Output lands in `marketing-out/` (gitignored). Copy is in `build.mjs`; edit it
there rather than in the exported PNGs.

`capture.mjs` replays external requests through node because the sandbox
Chromium has no direct egress. On a normal machine that route handler is
harmless — it just proxies straight through.
