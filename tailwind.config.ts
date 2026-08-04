import type { Config } from 'tailwindcss';

/**
 * W2W design tokens — Material 3 tonal system, ported from SpotMo.
 *
 * Every colour is a CSS variable rather than a fixed hex, so light and dark are
 * the same token set with different tonal values (see app/globals.css). The hue
 * family stays W2W's own: crimson primary and amber tertiary, because those two
 * carry meaning here — crimson marks commercial chains, amber marks indie
 * venues and festivals.
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
        // Primary — cinema crimson. Actions, commercial chains, live showtimes.
        brand: 'rgb(var(--c-primary) / <alpha-value>)',
        onbrand: 'rgb(var(--c-on-primary) / <alpha-value>)',
        brandsoft: 'rgb(var(--c-brand-soft) / <alpha-value>)',
        brandsoftfg: 'rgb(var(--c-brand-soft-fg) / <alpha-value>)',

        // Secondary — cool slate. Premium format badges (IMAX, Giant Screen).
        secondary: 'rgb(var(--c-secondary) / <alpha-value>)',
        onsecondary: 'rgb(var(--c-on-secondary) / <alpha-value>)',
        secondarysoft: 'rgb(var(--c-secondary-container) / <alpha-value>)',
        secondarysoftfg: 'rgb(var(--c-on-secondary-container) / <alpha-value>)',

        // Tertiary — amber. Microcinemas, cinematheques, festivals.
        tertiary: 'rgb(var(--c-tertiary) / <alpha-value>)',
        ontertiary: 'rgb(var(--c-on-tertiary) / <alpha-value>)',
        tertiarysoft: 'rgb(var(--c-tertiary-container) / <alpha-value>)',
        tertiarysoftfg: 'rgb(var(--c-on-tertiary-container) / <alpha-value>)',

        // Dolby Atmos keeps its own cyan — it is a third meaning, not a mood.
        atmos: 'rgb(var(--c-atmos) / <alpha-value>)',
        atmossoft: 'rgb(var(--c-atmos-container) / <alpha-value>)',
        atmossoftfg: 'rgb(var(--c-on-atmos-container) / <alpha-value>)',

        errorc: 'rgb(var(--c-error) / <alpha-value>)',

        // Semantic surfaces — these flip wholesale between themes.
        ink: 'rgb(var(--c-fg) / <alpha-value>)',
        onink: 'rgb(var(--c-on-fg) / <alpha-value>)',
        muted: 'rgb(var(--c-muted) / <alpha-value>)',
        surface: 'rgb(var(--c-surface) / <alpha-value>)',
        hairline: 'rgb(var(--c-line) / <alpha-value>)',
        card: 'rgb(var(--c-card) / <alpha-value>)',
        bg: 'rgb(var(--c-bg) / <alpha-value>)',
      },
      borderRadius: {
        '4xl': '2rem',
        '5xl': '2.5rem',
      },
      boxShadow: {
        // Material 3 elevation levels 1–4.
        soft: '0 1px 2px 0 rgba(0,0,0,0.30), 0 1px 3px 1px rgba(0,0,0,0.15)',
        card: '0 1px 2px 0 rgba(0,0,0,0.30), 0 2px 6px 2px rgba(0,0,0,0.15)',
        float: '0 4px 8px 3px rgba(0,0,0,0.15), 0 1px 3px 0 rgba(0,0,0,0.30)',
        fab: '0 6px 10px 4px rgba(0,0,0,0.15), 0 2px 3px 0 rgba(0,0,0,0.30)',
        pin: '0 6px 16px -4px rgba(0,0,0,0.45)',
      },
      fontFamily: {
        // Space Grotesk is the whole typeface system. Weight does the work that
        // a second family would otherwise do: 300 for dense metadata, 500 for
        // labels and UI, 700 for titles and numbers that must be read at a
        // glance. Every alias resolves to it so no stray fallback creeps in.
        sans: ['var(--font-space-grotesk)', '"Space Grotesk"', 'system-ui', 'sans-serif'],
        serif: ['var(--font-space-grotesk)', '"Space Grotesk"', 'system-ui', 'sans-serif'],
        title: ['var(--font-space-grotesk)', '"Space Grotesk"', 'system-ui', 'sans-serif'],
      },
      backdropBlur: {
        xs: '2px',
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'slide-up': {
          from: { transform: 'translateY(100%)' },
          to: { transform: 'translateY(0)' },
        },
        ripple: {
          from: { transform: 'scale(0)', opacity: '0.35' },
          to: { transform: 'scale(1)', opacity: '0' },
        },
        'pulse-ring': {
          '0%': { transform: 'scale(0.85)', opacity: '0.7' },
          '70%': { transform: 'scale(1.6)', opacity: '0' },
          '100%': { transform: 'scale(1.6)', opacity: '0' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.4s ease-out',
        'slide-up': 'slide-up 0.35s cubic-bezier(0.22, 1, 0.36, 1)',
        ripple: 'ripple 0.6s cubic-bezier(0.22, 1, 0.36, 1)',
        'pulse-ring': 'pulse-ring 2.4s cubic-bezier(0.4,0,0.6,1) infinite',
      },
    },
  },
  plugins: [],
};

export default config;
