import type { Metadata, Viewport } from 'next';
import { Space_Grotesk } from 'next/font/google';
import Script from 'next/script';
import { THEME_BOOTSTRAP } from '@/hooks/use-theme';
import './globals.css';

/** Google Analytics measurement ID. Not a secret — it is meant to ship in the client bundle. */
const GA_MEASUREMENT_ID = 'G-M30BNQ30XS';

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-space-grotesk',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'W2W — Where, When, What 2 Watch',
  description:
    'Real-time cinema discovery across the Philippines. Every screening, every format, from SM and Ayala to Cinemalaya and the microcinemas.',
  applicationName: 'W2W',
  // Relative so the same tags work at the root in dev and under /W2W/ on Pages.
  manifest: 'manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: 'W2W',
    statusBarStyle: 'black-translucent',
  },
  icons: {
    icon: [
      { url: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: 'icons/apple-touch-icon.png', sizes: '180x180' }],
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#000000' },
  ],
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // The bootstrap script below adds the theme class before React hydrates, so
    // the class list intentionally differs from what was rendered at build time.
    <html lang="en" className={spaceGrotesk.variable} suppressHydrationWarning>
      <head>
        {/* Sets the theme class before first paint so there is no flash. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
      </head>
      <body className="font-sans">
        {children}

        {/* Google Analytics. `afterInteractive` — loaded once the page is usable,
            so it never competes with the map or the first data fetch. */}
        <Script
          src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
          strategy="afterInteractive"
        />
        <Script id="ga-init" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', '${GA_MEASUREMENT_ID}');
          `}
        </Script>
      </body>
    </html>
  );
}
