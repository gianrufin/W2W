import type { Config } from 'tailwindcss';

/**
 * W2W design tokens.
 *
 * The visual language is a dark, cinematic "squircle" system: ultra-dark zinc
 * canvas, crimson for commercial screenings, amber for indie/festival, and
 * metallic gradients reserved for premium format badges.
 */
const config: Config = {
  darkMode: 'class',
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './hooks/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        canvas: {
          DEFAULT: '#09090b',
          raised: '#0c0a09',
          panel: '#111113',
        },
        crimson: {
          50: '#fff1f3',
          200: '#ffc9d2',
          400: '#ff5c7a',
          500: '#FF2A54',
          600: '#E50914',
          700: '#b30710',
        },
        indie: {
          400: '#fbbf24',
          500: '#F59E0B',
          600: '#d97706',
        },
        atmos: '#22d3ee',
        imax: '#94a3b8',
      },
      borderRadius: {
        squircle: '18px',
        'squircle-lg': '24px',
      },
      boxShadow: {
        float: '0 24px 60px -20px rgba(0,0,0,0.85)',
        pin: '0 8px 24px -6px rgba(229,9,20,0.55)',
        'pin-indie': '0 8px 24px -6px rgba(245,158,11,0.55)',
      },
      backgroundImage: {
        'metal-imax': 'linear-gradient(135deg,#1e293b 0%,#64748b 45%,#334155 100%)',
        'metal-gold': 'linear-gradient(135deg,#78350f 0%,#fbbf24 48%,#92400e 100%)',
        'metal-atmos': 'linear-gradient(135deg,#083344 0%,#22d3ee 48%,#0e7490 100%)',
        'crimson-glow': 'linear-gradient(135deg,#E50914 0%,#FF2A54 100%)',
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      letterSpacing: {
        tightest: '-0.045em',
      },
      keyframes: {
        'pulse-ring': {
          '0%': { transform: 'scale(0.85)', opacity: '0.7' },
          '70%': { transform: 'scale(1.6)', opacity: '0' },
          '100%': { transform: 'scale(1.6)', opacity: '0' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
      animation: {
        'pulse-ring': 'pulse-ring 2.4s cubic-bezier(0.4,0,0.6,1) infinite',
        shimmer: 'shimmer 2.5s linear infinite',
      },
    },
  },
  plugins: [],
};

export default config;
