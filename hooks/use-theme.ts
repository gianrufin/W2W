'use client';

import { useCallback, useEffect, useState } from 'react';

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'w2w-theme';

/**
 * Light/dark toggle. The class is applied to <html>, which is what flips every
 * CSS variable in globals.css.
 *
 * The initial class is set by an inline script in the layout before paint, so
 * this hook only has to read back what is already on the element — otherwise
 * the first render would flash the wrong theme.
 */
export function useTheme() {
  const [theme, setThemeState] = useState<Theme>('dark');

  useEffect(() => {
    const current = document.documentElement.classList.contains('dark') ? 'dark' : 'light';
    setThemeState(current);
  }, []);

  const setTheme = useCallback((next: Theme) => {
    document.documentElement.classList.toggle('dark', next === 'dark');
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Private mode — the theme just will not persist.
    }
    setThemeState(next);
  }, []);

  const toggle = useCallback(() => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  }, [theme, setTheme]);

  return { theme, setTheme, toggle };
}

/**
 * Runs before first paint. Kept as a string so it can be inlined into <head>.
 * Defaults to dark — W2W is a cinema app and that is its resting state.
 */
export const THEME_BOOTSTRAP = `
(function(){
  try {
    var stored = localStorage.getItem('${STORAGE_KEY}');
    // No stored choice means dark: the map and posters are built for it, and
    // it is the look the product leads with. Light is opt-in via the toggle.
    var dark = stored ? stored === 'dark' : true;
    document.documentElement.classList.toggle('dark', dark);
  } catch (e) {
    document.documentElement.classList.add('dark');
  }
})();
`;
