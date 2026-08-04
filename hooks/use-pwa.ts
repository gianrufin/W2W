'use client';

import { useCallback, useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISS_KEY = 'w2w-install-dismissed';

/**
 * Registers the service worker and captures the install prompt.
 *
 * The worker lives at `public/sw.js` and derives its own scope, so the same
 * file works at the root in dev and under /W2W/ on Pages. Registration is
 * skipped on http: origins other than localhost, where SWs are unavailable.
 */
export function usePwa() {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    try {
      setDismissed(window.localStorage.getItem(DISMISS_KEY) === 'true');
    } catch {
      setDismissed(false);
    }

    setInstalled(
      window.matchMedia('(display-mode: standalone)').matches ||
        // iOS Safari reports standalone on navigator, not via media query.
        (window.navigator as { standalone?: boolean }).standalone === true,
    );

    if ('serviceWorker' in navigator && (window.isSecureContext || location.hostname === 'localhost')) {
      // Relative URL keeps the scope tied to the deployment's base path.
      navigator.serviceWorker.register('sw.js').catch((err) => {
        console.warn('[w2w] service worker registration failed:', err);
      });
    }

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setInstallEvent(null);
    };

    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const promptInstall = useCallback(async () => {
    if (!installEvent) return 'unavailable' as const;
    await installEvent.prompt();
    const { outcome } = await installEvent.userChoice;
    setInstallEvent(null);
    return outcome;
  }, [installEvent]);

  const dismiss = useCallback(() => {
    setDismissed(true);
    try {
      window.localStorage.setItem(DISMISS_KEY, 'true');
    } catch {
      // Private mode — the banner just returns next session.
    }
  }, []);

  return {
    canInstall: Boolean(installEvent) && !installed && !dismissed,
    installed,
    promptInstall,
    dismiss,
  };
}
