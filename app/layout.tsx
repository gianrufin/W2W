import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'W2W — Where, When, What 2 Watch',
  description:
    'Real-time cinema discovery across the Philippines. Every screening, every format, from SM and Ayala to Cinemalaya and the microcinemas.',
  applicationName: 'W2W',
};

export const viewport: Viewport = {
  themeColor: '#09090b',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} dark`}>
      <body className="font-sans">{children}</body>
    </html>
  );
}
