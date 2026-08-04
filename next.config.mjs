/**
 * The GitHub Pages build sets NEXT_PUBLIC_BASE_PATH=/W2W, because a project
 * site is served from a subdirectory. Local dev leaves it empty and serves
 * from the root.
 */
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Static HTML export — the app is entirely client-side (no API routes, no
  // server actions), so Pages can serve it as plain files.
  output: 'export',
  basePath: basePath || undefined,
  assetPrefix: basePath || undefined,
  // Pages has no URL rewriting, so emit directories with index.html.
  trailingSlash: true,
  images: {
    // The export target has no image optimizer.
    unoptimized: true,
    remotePatterns: [
      { protocol: 'https', hostname: 'image.tmdb.org' },
      { protocol: 'https', hostname: '**.supabase.co' },
      { protocol: 'https', hostname: 'images.unsplash.com' },
    ],
  },
  // maplibre-gl ships untranspiled ESM helpers that Next can safely bundle.
  transpilePackages: ['maplibre-gl', 'react-map-gl'],
};

export default nextConfig;
