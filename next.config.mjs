/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
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
